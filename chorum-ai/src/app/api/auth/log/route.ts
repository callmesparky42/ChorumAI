import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'

export async function POST(req: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { provider, method } = await req.json()

        await db.insert(auditLogs).values({
            userId: session.user.id,
            action: 'LOGIN',
            provider: provider || 'unknown',
            details: { method: method || 'unknown' },
            securityFlags: {
                httpsEnforced: true, // Assumed for production
            }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to log login:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
