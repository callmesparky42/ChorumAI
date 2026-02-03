import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectLearningPaths, projects } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

/**
 * GET /api/learnings?projectId=xxx
 * List learnings for a project
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
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
        }

        // Verify user owns the project
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const learnings = await db.select({
            id: projectLearningPaths.id,
            type: projectLearningPaths.type,
            content: projectLearningPaths.content,
            context: projectLearningPaths.context,
            source: projectLearningPaths.source,
            domains: projectLearningPaths.domains,
            usageCount: projectLearningPaths.usageCount,
            createdAt: projectLearningPaths.createdAt
        })
            .from(projectLearningPaths)
            .where(eq(projectLearningPaths.projectId, projectId))
            .orderBy(desc(projectLearningPaths.createdAt))
            .limit(100)

        return NextResponse.json(learnings)
    } catch (error) {
        console.error('Learnings GET error:', error)
        return NextResponse.json({ error: 'Failed to fetch learnings' }, { status: 500 })
    }
}

/**
 * POST /api/learnings
 * Create a new learning (manual pin from conversation)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { projectId, type, content, context, source } = await req.json()

        if (!projectId || !type || !content) {
            return NextResponse.json({ error: 'projectId, type, and content are required' }, { status: 400 })
        }

        // Verify user owns the project
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Create the learning
        const [inserted] = await db.insert(projectLearningPaths).values({
            projectId,
            type,
            content,
            context: context || null,
            source: source || 'web-ui',
            metadata: {
                source_user: session.user.id,
                manual_pin: true
            }
        }).returning()

        console.log(`[Learning] Manual pin created: ${inserted.id} for project ${projectId}`)

        return NextResponse.json({
            success: true,
            id: inserted.id
        })
    } catch (error) {
        console.error('Learnings POST error:', error)
        return NextResponse.json({ error: 'Failed to create learning' }, { status: 500 })
    }
}

/**
 * DELETE /api/learnings?id=xxx
 * Delete a learning
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const learningId = searchParams.get('id')

        if (!learningId) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        // Find the learning and verify ownership via project
        const learning = await db.select({
            id: projectLearningPaths.id,
            projectId: projectLearningPaths.projectId
        })
            .from(projectLearningPaths)
            .where(eq(projectLearningPaths.id, learningId))
            .limit(1)

        if (!learning[0]) {
            return NextResponse.json({ error: 'Learning not found' }, { status: 404 })
        }

        // Verify user owns the project
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, learning[0].projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        // Delete the learning
        await db.delete(projectLearningPaths)
            .where(eq(projectLearningPaths.id, learningId))

        console.log(`[Learning] Deleted: ${learningId}`)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Learnings DELETE error:', error)
        return NextResponse.json({ error: 'Failed to delete learning' }, { status: 500 })
    }
}
