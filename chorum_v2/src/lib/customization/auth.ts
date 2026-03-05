import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createNebula } from '@/lib/nebula'
import type { TokenScope } from '@/lib/nebula/types'
import type { AuthContext } from './types'
import { TOOL_SCOPES } from './types'

export async function authenticate(request: Request): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      scopes: ['read:nebula', 'write:nebula', 'write:feedback', 'admin'],
    }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const plainToken = authHeader.slice(7)
  if (!plainToken) return null

  return verifyBearerToken(plainToken)
}

/**
 * Validates a plain-text Bearer token against the stored bcrypt hash.
 * Delegates entirely to NebulaInterface.validateApiToken — Layer 0 owns
 * token storage and comparison. Layer 2 must not access api_tokens directly.
 */
async function verifyBearerToken(plainToken: string): Promise<AuthContext | null> {
  const nebula = createNebula()
  const token = await nebula.validateApiToken(plainToken)
  if (!token) return null

  return {
    userId: token.userId,
    scopes: (token.scopes as TokenScope[]) ?? [],
  }
}

export function hasScope(auth: AuthContext, tool: string): boolean {
  const required = TOOL_SCOPES[tool]
  if (!required) return false
  if (auth.scopes.includes('admin')) return true
  return auth.scopes.includes(required)
}

export function enforceOwnership(auth: AuthContext, requestedUserId: string): boolean {
  if (auth.scopes.includes('admin')) return true
  return auth.userId === requestedUserId
}

