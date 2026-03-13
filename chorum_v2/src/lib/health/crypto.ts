import { createCipheriv, createDecipheriv, createHash, webcrypto } from 'node:crypto'

let _healthKey: Buffer | null = null

function getHealthKey(): Buffer {
  if (_healthKey) return _healthKey
  const keyBase64 = process.env.HEALTH_ENCRYPTION_KEY
  if (!keyBase64) throw new Error('HEALTH_ENCRYPTION_KEY is not set.')
  const coreKeyBase64 = process.env.ENCRYPTION_KEY
  if (keyBase64 === coreKeyBase64) {
    throw new Error(
      'HEALTH_ENCRYPTION_KEY must not equal ENCRYPTION_KEY. ' +
      'PHI and provider credentials must use separate keys.'
    )
  }
  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== 32) throw new Error('HEALTH_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  _healthKey = key
  return key
}

export class HealthDecryptionError extends Error {
  constructor() {
    super('Failed to decrypt PHI payload.')
    this.name = 'HealthDecryptionError'
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item))
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)] as const)
    return Object.fromEntries(entries)
  }
  return value
}

function canonicalStringify(data: object): string {
  return JSON.stringify(canonicalize(data))
}

function assertObject(data: unknown): object {
  if (data === null || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('PHI payload must be a non-null object.')
  }
  return data as object
}

export function encryptPHI(data: unknown): { ciphertext: string; iv: string; tag: string } {
  const safeData = assertObject(data)
  const plaintext = Buffer.from(canonicalStringify(safeData), 'utf8')
  const ivBytes = new Uint8Array(16)
  webcrypto.getRandomValues(ivBytes)
  const iv = Buffer.from(ivBytes)

  const cipher = createCipheriv('aes-256-gcm', getHealthKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const packedCiphertext = Buffer.concat([authTag, encrypted])

  return {
    ciphertext: packedCiphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
  }
}

export function decryptPHI(ciphertext: string, iv: string): object {
  try {
    const packed = Buffer.from(ciphertext, 'base64')
    const ivOnly = iv.includes(':') ? iv.split(':', 1)[0]! : iv
    const ivBuffer = Buffer.from(ivOnly, 'base64')
    if (packed.length <= 16 || ivBuffer.length !== 16) {
      throw new Error('invalid-payload-shape')
    }

    const authTag = packed.subarray(0, 16)
    const encrypted = packed.subarray(16)
    const decipher = createDecipheriv('aes-256-gcm', getHealthKey(), ivBuffer)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const parsed = JSON.parse(decrypted.toString('utf8')) as unknown

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('decrypted-payload-not-object')
    }
    return parsed as object
  } catch {
    throw new HealthDecryptionError()
  }
}

export function hashPHI(data: unknown): string {
  const safeData = assertObject(data)
  const canonical = canonicalStringify(safeData)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}
