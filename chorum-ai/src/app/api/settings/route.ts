import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ensureUserExists } from '@/lib/user-init'

export async function GET() {
    try {
        console.log('[Settings API] GET Request received')
        const session = await auth()
        console.log('[Settings API] Session:', session ? `User ID: ${session.user?.id}, Email: ${session.user?.email}` : 'NULL SESSION')

        // Development Bypass: If no session and in dev mode, return mock settings
        if (!session?.user?.id && process.env.NODE_ENV === 'development') {
            console.log('[Settings API] Using development bypass - returning mock settings')
            return NextResponse.json({
                name: 'Local Developer',
                email: 'dev@localhost',
                bio: 'Running in local development mode',
                securitySettings: {
                    enforceHttps: false,
                    anonymizePii: false,
                    strictSsl: false,
                    logAllRequests: false
                },
                fallbackSettings: {
                    enabled: true,
                    defaultProvider: null,
                    localFallbackModel: null,
                    priorityOrder: []
                },
                memorySettings: {
                    autoLearn: true,
                    learningMode: 'async',
                    injectContext: true,
                    autoSummarize: true,
                    validateResponses: true,
                    smartAgentRouting: true
                }
            })
        }

        if (!session?.user?.id) {
            console.log('[Settings API] No session.user.id - returning 401')
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Ensure user record exists (creates with defaults if new user)
        console.log('[Settings API] Calling ensureUserExists for:', session.user.email)
        const user = await ensureUserExists(
            session.user.id,
            session.user.email!,
            session.user.name
        )

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
        // Return explicit error details for debugging
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json({
            error: 'Failed to fetch settings',
            details: errorMessage
        }, { status: 500 })
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await auth()

        // Development Bypass
        if (!session?.user?.id && process.env.NODE_ENV === 'development') {
            return NextResponse.json({ success: true })
        }

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
