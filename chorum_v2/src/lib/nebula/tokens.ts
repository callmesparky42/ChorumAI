// src/lib/nebula/tokens.ts
import { db } from '@/db'
import { apiTokens } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { hash, compare } from 'bcryptjs'
import type { ApiToken, TokenScope } from './types'
import type { CreateApiTokenInput } from './interface'
import { NebulaError } from './errors'
import { randomBytes } from 'crypto'

function rowToToken(row: typeof apiTokens.$inferSelect): ApiToken {
  return {
    id:          row.id,
    userId:      row.userId,
    name:        row.name,
    hashedToken: row.hashedToken,
    scopes:      (row.scopes as TokenScope[]) ?? [],
    lastUsedAt:  row.lastUsedAt ?? null,
    expiresAt:   row.expiresAt ?? null,
    revokedAt:   row.revokedAt ?? null,
    createdAt:   row.createdAt,
  }
}

/**
 * Validate a Bearer token. Returns the token record if valid, null otherwise.
 * Updates lastUsedAt on success (fire-and-forget).
 *
 * IMPORTANT: The hashed_token column stores a bcrypt hash.
 * The caller passes the plain-text token from the Authorization header.
 * We use bcrypt compare — NOT a direct lookup — to validate.
 *
 * Performance note: bcrypt compare is slow by design. For high-throughput MCP
 * endpoints, add a short-lived in-memory token cache in Phase 3.
 */
export async function validateApiToken(plainToken: string): Promise<ApiToken | null> {
  // We cannot do a direct WHERE lookup on the hash (bcrypt is not reversible).
  // Strategy: hash prefix lookup. We store a fast SHA-256 prefix as a secondary
  // index key. Phase 3 optimization. For Phase 1: full table scan with bcrypt
  // compare is acceptable (token table will be tiny: <100 rows per user).
  //
  // PHASE 1 IMPLEMENTATION: iterate active (non-revoked, non-expired) tokens
  // and bcrypt.compare against each. This is O(n) but correct.

  const now = new Date()
  const activeRows = await db
    .select()
    .from(apiTokens)
    .where(and(isNull(apiTokens.revokedAt)))

  for (const row of activeRows) {
    if (row.expiresAt && row.expiresAt < now) continue

    const match = await compare(plainToken, row.hashedToken)
    if (match) {
      // Fire-and-forget: update lastUsedAt
      db.update(apiTokens)
        .set({ lastUsedAt: now })
        .where(eq(apiTokens.id, row.id))
        .catch(() => { /* non-critical */ })

      return rowToToken(row)
    }
  }

  return null
}

export async function createApiToken(
  input: CreateApiTokenInput,
): Promise<{ token: string; record: ApiToken }> {
  const plainToken  = randomBytes(32).toString('hex')   // 64-char hex token
  const hashedToken = await hash(plainToken, 12)

  const [row] = await db
    .insert(apiTokens)
    .values({
      userId:      input.userId,
      name:        input.name,
      hashedToken,
      scopes:      input.scopes,
      expiresAt:   input.expiresAt ?? null,
    })
    .returning()

  if (!row) throw new NebulaError('INTERNAL', 'Token insert returned no row')

  return { token: plainToken, record: rowToToken(row) }
}

export async function revokeApiToken(id: string): Promise<void> {
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id))
}