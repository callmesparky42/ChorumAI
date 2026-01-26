import { db } from '@/lib/db'
import { apiTokens } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import type { TokenPermissions } from './types'

const TOKEN_PREFIX = 'chorum_'
const TOKEN_LENGTH = 32

export interface AuthResult {
  valid: boolean
  userId?: string
  permissions?: TokenPermissions
  error?: string
}

export async function generateToken(userId: string, name?: string): Promise<string> {
  const tokenValue = TOKEN_PREFIX + randomBytes(TOKEN_LENGTH).toString('base64url')

  await db.insert(apiTokens).values({
    userId,
    token: tokenValue,
    name: name || 'Default'
  })

  return tokenValue
}

export async function validateToken(token: string): Promise<AuthResult> {
  if (!token?.startsWith(TOKEN_PREFIX)) {
    return { valid: false, error: 'Invalid token format' }
  }

  const [tokenRecord] = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.token, token),
        isNull(apiTokens.revokedAt)
      )
    )
    .limit(1)

  if (!tokenRecord) {
    return { valid: false, error: 'Token not found or revoked' }
  }

  // Check expiration
  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
    return { valid: false, error: 'Token expired' }
  }

  // Update last used timestamp (fire-and-forget)
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tokenRecord.id))
    .execute()
    .catch(() => {}) // Ignore errors

  return {
    valid: true,
    userId: tokenRecord.userId,
    permissions: tokenRecord.permissions as TokenPermissions
  }
}

export async function revokeToken(tokenId: string, userId: string): Promise<boolean> {
  // First check if token exists and belongs to user
  const [existing] = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    )
    .limit(1)

  if (!existing) {
    return false
  }

  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.id, tokenId))

  return true
}

export async function listTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      permissions: apiTokens.permissions,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
      // Don't return the actual token value for security
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    )
    .orderBy(apiTokens.createdAt)
}
