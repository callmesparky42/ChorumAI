import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths, projects } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/conductor/feedback
 * Thumbs up/down feedback on learning items
 * 
 * Body: { itemId: string, signal: 'positive' | 'negative' }
 * Response: { success: true }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { itemId, signal } = body

        if (!itemId || !signal) {
            return NextResponse.json(
                { error: 'Missing required fields: itemId, signal' },
                { status: 400 }
            )
        }

        if (!['positive', 'negative'].includes(signal)) {
            return NextResponse.json(
                { error: 'Invalid signal. Must be: positive, negative' },
                { status: 400 }
            )
        }

        // Verify the item exists and user has access
        const [item] = await db
            .select({
                id: projectLearningPaths.id,
                projectId: projectLearningPaths.projectId,
                usageCount: projectLearningPaths.usageCount
            })
            .from(projectLearningPaths)
            .innerJoin(projects, eq(projectLearningPaths.projectId, projects.id))
            .where(
                and(
                    eq(projectLearningPaths.id, itemId),
                    eq(projects.userId, session.user.id)
                )
            )
            .limit(1)

        if (!item) {
            return NextResponse.json(
                { error: 'Item not found or access denied' },
                { status: 404 }
            )
        }

        // Positive feedback: increment usage count
        // Negative feedback: for now, just log (future: could reduce priority or trigger mute suggestion)
        if (signal === 'positive') {
            await db
                .update(projectLearningPaths)
                .set({
                    usageCount: sql`${projectLearningPaths.usageCount} + 1`,
                    lastUsedAt: new Date()
                })
                .where(eq(projectLearningPaths.id, itemId))
        }

        console.log(`[Conductor] Feedback on item ${itemId}: ${signal}`)

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('[Conductor/feedback] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
