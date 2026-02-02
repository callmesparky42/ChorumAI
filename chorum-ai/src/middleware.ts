import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
    let res = NextResponse.next({
        request: {
            headers: req.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll()
                },
                setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                    cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
                    res = NextResponse.next({
                        request: {
                            headers: req.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        res.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // IMPORTANT: Use getUser() for secure server-side auth, NOT getSession()
    // getSession() only reads from cookies without validating the JWT
    const {
        data: { user },
    } = await supabase.auth.getUser()


    const isAuthPage = req.nextUrl.pathname.startsWith('/login')
    const isAuthCallback = req.nextUrl.pathname.startsWith('/auth/callback')
    const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth') // Keep for deprecated routes temporarily
    const isOnboardingPage = req.nextUrl.pathname.startsWith('/onboarding')
    const isOnboardingApi = req.nextUrl.pathname.startsWith('/api/onboarding')
    const isAuditApi = req.nextUrl.pathname.startsWith('/api/audit')
    const isPublicPage = req.nextUrl.pathname === '/'

    // Redirect authenticated users from landing page to app
    if (isPublicPage) {
        if (user) {
            return NextResponse.redirect(new URL('/app', req.url))
        }
        return res
    }

    // Allow auth callback (OAuth flow)
    if (isAuthCallback) {
        return res
    }

    // Allow onboarding routes (pre-auth setup wizard)
    // Note: We might want to protect this soon
    if (isOnboardingPage || isOnboardingApi) {
        return res
    }

    // Redirect logged-in users away from login page
    if (isAuthPage && user) {
        return NextResponse.redirect(new URL('/app', req.url))
    }

    // Redirect unauthenticated users to login
    if (!user && !isAuthPage) {
        // Return 401 for API routes so the client can handle it gracefully
        if (req.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', req.url))
    }

    return res
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|chorumai.png|interface.jpg|learning.jpg|modelprovider.jpg).*)'],
}
