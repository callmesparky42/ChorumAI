import { createClient } from '@/lib/supabase-server'
import { validateToken } from '@/lib/mcp/auth'
import { NextRequest } from 'next/server'

// Session shape returned by auth functions
export interface AuthSession {
    user: {
        id: string
        email?: string
        name?: string
        image?: string
    }
    expires: null
}

// Shim for NextAuth's auth() function using Supabase
export async function auth(): Promise<AuthSession | null> {
    try {
        const supabase = await createClient()

        // IMPORTANT: Use getUser() for secure server-side auth, NOT getSession()
        // getSession() only reads from cookies without validating the JWT
        // getUser() makes a request to Supabase Auth to validate the token
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            console.log('[Auth] No valid user session:', error?.message || 'No user')
            return null
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.email,
                image: user.user_metadata?.avatar_url,
            },
            expires: null // getUser doesn't provide expiry, but that's okay
        }
    } catch (error) {
        console.error("Auth Shim Error:", error)
        return null
    }
}

/**
 * Authenticate from a NextRequest - supports both:
 * 1. Bearer token auth (for mobile apps like MidnightMusings)
 * 2. Session cookie auth (for web UI)
 * 
 * Usage in API routes:
 *   const session = await authFromRequest(req)
 *   if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */
export async function authFromRequest(req: NextRequest): Promise<AuthSession | null> {
    // Check for Bearer token first (mobile/API clients)
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7) // Remove 'Bearer ' prefix

        try {
            const result = await validateToken(token)

            if (result.valid && result.userId) {
                console.log('[Auth] Bearer token validated for user:', result.userId)
                return {
                    user: {
                        id: result.userId,
                        // Token auth doesn't provide email/name, but that's okay
                        // The userId is sufficient for authorization
                    },
                    expires: null
                }
            } else {
                console.log('[Auth] Bearer token invalid:', result.error)
                return null
            }
        } catch (error) {
            console.error('[Auth] Bearer token validation error:', error)
            return null
        }
    }

    // Fall back to session cookie auth (web UI)
    return auth()
}

// Dummy exports to prevent import errors during transition
export const handlers = { GET: () => { }, POST: () => { } }
export const signIn = () => { }
export const signOut = () => { }
