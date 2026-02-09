import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths, projects, projectConfidence } from '@/lib/db/schema'
import { eq, and, sql, isNotNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/conductor/health?projectId=...
 * Get aggregated Conductor stats for a project
 * 
 * Response: {
 *   totalItems: number,
 *   byType: { invariant: number, pattern: number, ... },
 *   pinnedCount: number,
 *   mutedCount: number,
 *   avgScore: number,
 *   confidenceScore: number
 * }
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

        // Fetch all items for this project
        const items = await db
            .select({
                type: projectLearningPaths.type,
                pinnedAt: projectLearningPaths.pinnedAt,
                mutedAt: projectLearningPaths.mutedAt,
                usageCount: projectLearningPaths.usageCount
            })
            .from(projectLearningPaths)
            .where(eq(projectLearningPaths.projectId, projectId))

        // Aggregate stats
        const byType: Record<string, number> = {}
        let pinnedCount = 0
        let mutedCount = 0
        let totalUsageCount = 0

        for (const item of items) {
            byType[item.type] = (byType[item.type] || 0) + 1
            if (item.pinnedAt) pinnedCount++
            if (item.mutedAt) mutedCount++
            totalUsageCount += item.usageCount ?? 0
        }

        // Fetch confidence score
        const [confidence] = await db
            .select({ score: projectConfidence.score })
            .from(projectConfidence)
            .where(eq(projectConfidence.projectId, projectId))
            .limit(1)

        // Calculate average usage (proxy for "avg score")
        const avgUsage = items.length > 0 ? totalUsageCount / items.length : 0

        return NextResponse.json({
            totalItems: items.length,
            byType,
            pinnedCount,
            mutedCount,
            avgUsage: Math.round(avgUsage * 100) / 100,
            confidenceScore: confidence?.score ? Number(confidence.score) : null
        })

    } catch (error) {
        console.error('[Conductor/health] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
