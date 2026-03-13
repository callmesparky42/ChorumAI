import { NextRequest, NextResponse } from 'next/server'

// Redirect to NextAuth Google sign-in with mobile-callback as the return URL.
export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url)
  const callbackUrl = `${origin}/api/auth/mobile-callback`
  const signInUrl = `${origin}/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`
  return NextResponse.redirect(signInUrl)
}
