import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const [user] = await db.select().from(users).where(eq(users.id, session.user.id))

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        return NextResponse.json({
            name: user.name,
            email: user.email,
            bio: user.bio,
            securitySettings: user.securitySettings || {
                enforceHttps: false,
                anonymizePii: false,
                strictSsl: false,
                logAllRequests: false
            },
            fallbackSettings: user.fallbackSettings || {
                enabled: true,
                defaultProvider: null,
                localFallbackModel: null,
                priorityOrder: []
            },
            memorySettings: user.memorySettings || {
                autoLearn: true,
                learningMode: 'async',
                injectContext: true,
                autoSummarize: true,
                validateResponses: true,
                smartAgentRouting: true
            }
        })
    } catch (error) {
        console.error('Settings GET error:', error)
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()

        // Build update object with only allowed fields
        const updateData: Record<string, unknown> = {}
        if (body.name !== undefined) updateData.name = body.name
        if (body.bio !== undefined) updateData.bio = body.bio
        if (body.securitySettings !== undefined) updateData.securitySettings = body.securitySettings
        if (body.fallbackSettings !== undefined) updateData.fallbackSettings = body.fallbackSettings
        if (body.memorySettings !== undefined) updateData.memorySettings = body.memorySettings
        // Note: email changes should require verification, skipping for now

        await db.update(users).set(updateData).where(eq(users.id, session.user.id))

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Settings PATCH error:', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }
}
