import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const isAuthPage = req.nextUrl.pathname.startsWith('/login')
    const isAuthApi = req.nextUrl.pathname.startsWith('/api/auth')
    const isOnboardingPage = req.nextUrl.pathname.startsWith('/onboarding')
    const isOnboardingApi = req.nextUrl.pathname.startsWith('/api/onboarding')

    // Allow auth API routes
    if (isAuthApi) {
        return NextResponse.next()
    }

    // Allow onboarding routes (pre-auth setup wizard)
    if (isOnboardingPage || isOnboardingApi) {
        return NextResponse.next()
    }

    // Redirect logged-in users away from login page
    if (isAuthPage && isLoggedIn) {
        return NextResponse.redirect(new URL('/', req.url))
    }

    // Redirect unauthenticated users to login
    if (!isLoggedIn && !isAuthPage) {
        return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
})

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
}
