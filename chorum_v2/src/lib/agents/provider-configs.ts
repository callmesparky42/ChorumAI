import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { providerConfigs } from '@/db/schema'
import { normalizeProviderId } from '@/lib/providers'
import type { ProviderConfig, SaveProviderConfigInput } from './types'

const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const encoded = process.env.ENCRYPTION_KEY
  if (!encoded) {
    throw new Error('ENCRYPTION_KEY environment variable is required')
  }

  const key = Buffer.from(encoded, 'base64')
  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must decode to at least 32 bytes')
  }

  return key.subarray(0, 32)
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

function decrypt(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format')

  const [ivHex, tagHex, encrypted] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function toProviderConfig(row: typeof providerConfigs.$inferSelect): ProviderConfig {
  return {
    id: row.id,
    userId: row.userId,
    provider: normalizeProviderId(row.provider),
    apiKey: decrypt(row.apiKeyEnc),
    modelOverride: row.modelOverride,
    baseUrl: row.baseUrl,
    isLocal: row.isLocal,
    isEnabled: row.isEnabled,
    priority: row.priority,
  }
}

async function getProviderRowsForUser(userId: string): Promise<(typeof providerConfigs.$inferSelect)[]> {
  return db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.userId, userId))
}

async function findStoredProviderRow(
  userId: string,
  provider: string,
): Promise<typeof providerConfigs.$inferSelect | undefined> {
  const normalizedProvider = normalizeProviderId(provider)
  const rows = await getProviderRowsForUser(userId)

  return rows.find((row) => normalizeProviderId(row.provider) === normalizedProvider)
}

export async function getUserProviders(userId: string): Promise<ProviderConfig[]> {
  const rows = await getProviderRowsForUser(userId)

  const deduped = rows
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })
    .reduce<(typeof providerConfigs.$inferSelect)[]>((acc, row) => {
      const normalizedProvider = normalizeProviderId(row.provider)
      const exists = acc.some((item) => normalizeProviderId(item.provider) === normalizedProvider)
      if (!exists) acc.push(row)
      return acc
    }, [])

  return deduped.map(toProviderConfig)
}

export async function saveProviderConfig(
  userId: string,
  input: SaveProviderConfigInput,
): Promise<ProviderConfig> {
  const normalizedProvider = normalizeProviderId(input.provider)
  const encrypted = encrypt(input.apiKey)
  const existing = await findStoredProviderRow(userId, normalizedProvider)

  if (existing) {
    const [row] = await db
      .update(providerConfigs)
      .set({
        provider: normalizedProvider,
        apiKeyEnc: encrypted,
        modelOverride: input.modelOverride,
        baseUrl: input.baseUrl,
        isLocal: input.isLocal,
        priority: input.priority,
        isEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(providerConfigs.id, existing.id))
      .returning()

    if (!row) throw new Error('Failed to save provider config')
    return toProviderConfig(row)
  }

  const [row] = await db
    .insert(providerConfigs)
    .values({
      userId,
      provider: normalizedProvider,
      apiKeyEnc: encrypted,
      modelOverride: input.modelOverride,
      baseUrl: input.baseUrl,
      isLocal: input.isLocal,
      priority: input.priority,
      isEnabled: true,
    })
    .returning()

  if (!row) throw new Error('Failed to save provider config')
  return toProviderConfig(row)
}

export async function disableProvider(userId: string, provider: string): Promise<void> {
  const existing = await findStoredProviderRow(userId, provider)
  if (!existing) return

  await db
    .update(providerConfigs)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(eq(providerConfigs.id, existing.id))
}

export async function deleteProviderConfig(userId: string, provider: string): Promise<void> {
  const existing = await findStoredProviderRow(userId, provider)
  if (!existing) return

  await db
    .delete(providerConfigs)
    .where(eq(providerConfigs.id, existing.id))
}
