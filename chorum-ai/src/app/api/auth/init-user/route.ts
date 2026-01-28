import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { ensureUserExists } from '@/lib/user-init'

/**
 * User initialization endpoint for email/password signups
 * Called after Supabase auth is created to ensure app user record exists
 */
export async function POST() {
    try {
        const session = await auth()

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Create user record with default settings
        await ensureUserExists(
            session.user.id,
            session.user.email!,
            session.user.name
        )

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('User initialization error:', error)
        return NextResponse.json({ error: 'Failed to initialize user' }, { status: 500 })
    }
}
