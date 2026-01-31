import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
    // Protect debug endpoint - require authentication
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only return safe, non-sensitive diagnostic info
    return NextResponse.json({
        authenticated: true,
        nodeEnv: process.env.NODE_ENV,
        hasRequiredEnv: {
            database: !!process.env.DATABASE_URL,
            encryption: !!process.env.ENCRYPTION_KEY,
            supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL
        }
    })
}
