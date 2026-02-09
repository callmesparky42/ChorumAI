import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/conductor/lens?projectId=...
 * Get current conductor lens settings for a project
 * 
 * Response: { lens: number, focusDomains: string[] }
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get('projectId')

        if (!projectId) {
            return NextResponse.json(
                { error: 'Missing projectId parameter' },
                { status: 400 }
            )
        }

        const [project] = await db
            .select({
                conductorLens: projects.conductorLens,
                focusDomains: projects.focusDomains
            })
            .from(projects)
            .where(
                and(
                    eq(projects.id, projectId),
                    eq(projects.userId, session.user.id)
                )
            )
            .limit(1)

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found or access denied' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            lens: project.conductorLens ? Number(project.conductorLens) : 1.0,
            focusDomains: project.focusDomains ?? []
        })

    } catch (error) {
        console.error('[Conductor/lens] GET Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/conductor/lens
 * Update conductor lens settings for a project
 * 
 * Body: { projectId: string, lens?: number, focusDomains?: string[] }
 * Response: { success: true, lens: number, focusDomains: string[] }
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { projectId, lens, focusDomains } = body

        if (!projectId) {
            return NextResponse.json(
                { error: 'Missing projectId' },
                { status: 400 }
            )
        }

        // Verify ownership
        const [project] = await db
            .select({ id: projects.id })
            .from(projects)
            .where(
                and(
                    eq(projects.id, projectId),
                    eq(projects.userId, session.user.id)
                )
            )
            .limit(1)

        if (!project) {
            return NextResponse.json(
                { error: 'Project not found or access denied' },
                { status: 404 }
            )
        }

        // Build update
        const update: { conductorLens?: string; focusDomains?: string[] } = {}

        if (lens !== undefined) {
            // Clamp lens to 0.25-2.0
            const clampedLens = Math.max(0.25, Math.min(2.0, Number(lens)))
            update.conductorLens = clampedLens.toFixed(2)
        }

        if (focusDomains !== undefined) {
            if (!Array.isArray(focusDomains)) {
                return NextResponse.json(
                    { error: 'focusDomains must be an array' },
                    { status: 400 }
                )
            }
            update.focusDomains = focusDomains.filter(d => typeof d === 'string')
        }

        if (Object.keys(update).length > 0) {
            await db
                .update(projects)
                .set(update)
                .where(eq(projects.id, projectId))
        }

        // Fetch updated values
        const [updated] = await db
            .select({
                conductorLens: projects.conductorLens,
                focusDomains: projects.focusDomains
            })
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)

        console.log(`[Conductor] Updated lens settings for project ${projectId}:`, {
            lens: updated.conductorLens,
            focusDomains: updated.focusDomains
        })

        return NextResponse.json({
            success: true,
            lens: updated.conductorLens ? Number(updated.conductorLens) : 1.0,
            focusDomains: updated.focusDomains ?? []
        })

    } catch (error) {
        console.error('[Conductor/lens] PATCH Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
