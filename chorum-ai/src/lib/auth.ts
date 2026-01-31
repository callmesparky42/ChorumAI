import { createClient } from '@/lib/supabase-server'

// Shim for NextAuth's auth() function using Supabase
export async function auth() {
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

// Dummy exports to prevent import errors during transition
export const handlers = { GET: () => { }, POST: () => { } }
export const signIn = () => { }
export const signOut = () => { }
