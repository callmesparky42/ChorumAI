import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { analyzeProjectDomain, getOrComputeDomainSignal } from '@/lib/chorum/domainSignal'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/conductor/domain?projectId=...
 * Get the current domain signal for a project (compute if missing/stale)
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

        const signal = await getOrComputeDomainSignal(projectId)

        return NextResponse.json({
            primary: signal.primary,
            domains: signal.domains,
            conversationsAnalyzed: signal.conversationsAnalyzed,
            computedAt: signal.computedAt.toISOString()
        })

    } catch (error) {
        console.error('[Conductor/domain] GET Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/conductor/domain
 * Force recompute domain signal for a project
 *
 * Body: { projectId: string }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { projectId } = body

        if (!projectId) {
            return NextResponse.json(
                { error: 'Missing projectId' },
                { status: 400 }
            )
        }

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

        const signal = await analyzeProjectDomain(projectId)

        return NextResponse.json({
            primary: signal.primary,
            domains: signal.domains,
            conversationsAnalyzed: signal.conversationsAnalyzed,
            computedAt: signal.computedAt.toISOString()
        })

    } catch (error) {
        console.error('[Conductor/domain] POST Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
