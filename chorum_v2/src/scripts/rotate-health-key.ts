// PHI key rotation script.
// Usage:
//   NEW_HEALTH_ENCRYPTION_KEY=<base64-key> npx tsx src/scripts/rotate-health-key.ts
//
// Requirements:
//   - HEALTH_DATABASE_URL (current health DB)
//   - HEALTH_ENCRYPTION_KEY (old key, currently active)
//   - NEW_HEALTH_ENCRYPTION_KEY (new key)

import 'dotenv/config'
import { createCipheriv, createDecipheriv, createHash, webcrypto } from 'node:crypto'
import postgres from 'postgres'

type SnapshotRow = {
  id: string
  encrypted_payload: string
  payload_iv: string
}

const BATCH_SIZE = 100
const MAX_CONSECUTIVE_FAILURES = 3

function readKey(name: string): Buffer {
  const raw = process.env[name]
  if (!raw) {
    throw new Error(`${name} is required`)
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes`)
  }
  return key
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, canonicalize(v)] as const)
    return Object.fromEntries(entries)
  }
  return value
}

function canonicalStringify(value: object): string {
  return JSON.stringify(canonicalize(value))
}

function decryptWithKey(ciphertext: string, iv: string, key: Buffer): object {
  const packed = Buffer.from(ciphertext, 'base64')
  const ivOnly = iv.includes(':') ? iv.split(':', 1)[0]! : iv
  const ivBytes = Buffer.from(ivOnly, 'base64')

  if (packed.length <= 16 || ivBytes.length !== 16) {
    throw new Error('Invalid ciphertext payload shape')
  }

  const authTag = packed.subarray(0, 16)
  const encrypted = packed.subarray(16)
  const decipher = createDecipheriv('aes-256-gcm', key, ivBytes)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

  const parsed = JSON.parse(decrypted.toString('utf8')) as unknown
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Decrypted payload is not an object')
  }
  return parsed as object
}

function encryptWithKey(payload: object, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = new Uint8Array(16)
  webcrypto.getRandomValues(iv)
  const ivBuffer = Buffer.from(iv)

  const cipher = createCipheriv('aes-256-gcm', key, ivBuffer)
  const plaintext = Buffer.from(canonicalStringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const packed = Buffer.concat([authTag, encrypted])

  return {
    ciphertext: packed.toString('base64'),
    iv: ivBuffer.toString('base64'),
    tag: authTag.toString('base64'),
  }
}

function hashPayload(payload: object): string {
  return createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex')
}

async function main() {
  const databaseUrl = process.env.HEALTH_DATABASE_URL
  if (!databaseUrl) throw new Error('HEALTH_DATABASE_URL is required')

  const oldKey = readKey('HEALTH_ENCRYPTION_KEY')
  const newKey = readKey('NEW_HEALTH_ENCRYPTION_KEY')
  if (oldKey.equals(newKey)) {
    throw new Error('NEW_HEALTH_ENCRYPTION_KEY must differ from HEALTH_ENCRYPTION_KEY')
  }

  const client = postgres(databaseUrl, { prepare: false })

  let processed = 0
  let errors = 0
  let consecutiveFailures = 0
  let cursor = ''

  console.log('Starting health PHI key rotation...')

  while (true) {
    const rows = await client<SnapshotRow[]>`
      SELECT id, encrypted_payload, payload_iv
      FROM health_snapshots
      WHERE id > ${cursor}
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `

    if (rows.length === 0) break

    try {
      await client.begin(async (tx) => {
        for (const row of rows) {
          const decrypted = decryptWithKey(row.encrypted_payload, row.payload_iv, oldKey)
          const reEncrypted = encryptWithKey(decrypted, newKey)
          const payloadHash = hashPayload(decrypted)

          await tx.unsafe(
            `UPDATE health_snapshots
             SET encrypted_payload = $1,
                 payload_iv = $2,
                 payload_hash = $3
             WHERE id = $4`,
            [reEncrypted.ciphertext, reEncrypted.iv, payloadHash, row.id],
          )
        }
      })

      processed += rows.length
      consecutiveFailures = 0
      console.log(`Rotated ${processed} rows...`)
    } catch (err) {
      errors += 1
      consecutiveFailures += 1
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Batch failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${message}`)

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await client.end()
        throw new Error(`Aborting after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`)
      }
    }

    cursor = rows.at(-1)!.id
  }

  await client.end()
  console.log(`Rotation complete. Processed=${processed} Errors=${errors}`)
  console.log('Next steps:')
  console.log('1. Set HEALTH_ENCRYPTION_KEY = NEW_HEALTH_ENCRYPTION_KEY in all environments')
  console.log('2. Remove NEW_HEALTH_ENCRYPTION_KEY from all environments')
  console.log('3. Redeploy all services')
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
