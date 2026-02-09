import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths, projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * PATCH /api/conductor/items
 * Pin or mute learning items
 * 
 * Body: { itemId: string, action: 'pin' | 'unpin' | 'mute' | 'unmute' }
 * Response: { success: true, item: { id, pinnedAt, mutedAt } }
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { itemId, action } = body

        if (!itemId || !action) {
            return NextResponse.json(
                { error: 'Missing required fields: itemId, action' },
                { status: 400 }
            )
        }

        if (!['pin', 'unpin', 'mute', 'unmute'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Must be: pin, unpin, mute, unmute' },
                { status: 400 }
            )
        }

        // Verify the item exists and user has access via project ownership
        const [item] = await db
            .select({
                id: projectLearningPaths.id,
                projectId: projectLearningPaths.projectId,
                pinnedAt: projectLearningPaths.pinnedAt,
                mutedAt: projectLearningPaths.mutedAt
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

        // Build update based on action
        const now = new Date()
        let update: { pinnedAt?: Date | null; mutedAt?: Date | null } = {}

        switch (action) {
            case 'pin':
                update = { pinnedAt: now, mutedAt: null } // Pin clears mute
                break
            case 'unpin':
                update = { pinnedAt: null }
                break
            case 'mute':
                update = { mutedAt: now, pinnedAt: null } // Mute clears pin
                break
            case 'unmute':
                update = { mutedAt: null }
                break
        }

        await db
            .update(projectLearningPaths)
            .set(update)
            .where(eq(projectLearningPaths.id, itemId))

        // Fetch updated item
        const [updated] = await db
            .select({
                id: projectLearningPaths.id,
                pinnedAt: projectLearningPaths.pinnedAt,
                mutedAt: projectLearningPaths.mutedAt
            })
            .from(projectLearningPaths)
            .where(eq(projectLearningPaths.id, itemId))
            .limit(1)

        console.log(`[Conductor] Item ${itemId}: ${action} → pinnedAt=${updated.pinnedAt}, mutedAt=${updated.mutedAt}`)

        return NextResponse.json({
            success: true,
            item: updated
        })

    } catch (error) {
        console.error('[Conductor/items] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
