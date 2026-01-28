import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const origin = requestUrl.origin

    if (code) {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        )

        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
            console.error('OAuth callback error:', error)
            return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
        }

        if (session?.user) {
            // Ensure user record exists in database before redirect
            try {
                const { ensureUserExists } = await import('@/lib/user-init')
                await ensureUserExists(
                    session.user.id,
                    session.user.email!,
                    session.user.user_metadata?.full_name || session.user.email
                )
            } catch (err) {
                console.error('Failed to create user record:', err)
                // Don't block login on user creation failure - it will be created lazily
            }

            // Log OAuth login
            try {
                const { db } = await import('@/lib/db')
                const { auditLogs } = await import('@/lib/db/schema')

                await db.insert(auditLogs).values({
                    userId: session.user.id,
                    action: 'LOGIN',
                    provider: 'google',
                    details: { method: 'oauth_callback' },
                    securityFlags: { httpsEnforced: true }
                })
            } catch (err) {
                console.error('Failed to log login:', err)
            }

            // Redirect to app after successful authentication
            return NextResponse.redirect(`${origin}/app`)
        }
    }

    // If no code or session, redirect to login
    return NextResponse.redirect(`${origin}/login`)
}
