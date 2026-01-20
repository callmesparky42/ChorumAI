/**
 * Learning API
 * CRUD endpoints for learning items (patterns, invariants, antipatterns, decisions, golden paths)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, projectLearningPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
    getProjectLearning,
    getProjectLearningByType,
    addLearningItem,
    updateLearningItem,
    deleteLearningItem,
    getProjectConfidence,
    setCriticalFile,
    getCriticalFiles
} from '@/lib/learning/manager'
import type { LearningType, CreateLearningItemInput } from '@/lib/learning/types'

const VALID_TYPES: LearningType[] = ['pattern', 'antipattern', 'decision', 'invariant', 'golden_path']

/**
 * Verify user owns the project
 */
async function verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
    const project = await db.query.projects.findFirst({
        where: and(
            eq(projects.id, projectId),
            eq(projects.userId, userId)
        )
    })
    return !!project
}

/**
 * GET /api/learning?projectId=xxx
 * GET /api/learning?projectId=xxx&type=invariant
 * GET /api/learning?projectId=xxx&confidence=true
 * GET /api/learning?projectId=xxx&criticalFiles=true
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get('projectId')
        const type = searchParams.get('type') as LearningType | null
        const getConfidence = searchParams.get('confidence') === 'true'
        const getCritical = searchParams.get('criticalFiles') === 'true'

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
        }

        // Verify access
        const hasAccess = await verifyProjectAccess(session.user.id, projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Return confidence score
        if (getConfidence) {
            const confidence = await getProjectConfidence(projectId)
            return NextResponse.json({ confidence })
        }

        // Return critical files
        if (getCritical) {
            const files = await getCriticalFiles(projectId)
            return NextResponse.json({ criticalFiles: files })
        }

        // Return learning items (optionally filtered by type)
        if (type) {
            if (!VALID_TYPES.includes(type)) {
                return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
            }
            const items = await getProjectLearningByType(projectId, type)
            return NextResponse.json({ items })
        }

        const items = await getProjectLearning(projectId)
        return NextResponse.json({ items })

    } catch (error: unknown) {
        console.error('Learning GET error:', error instanceof Error ? error.message : error)
        return NextResponse.json({ error: 'Failed to fetch learning items' }, { status: 500 })
    }
}

/**
 * POST /api/learning
 * Create a new learning item
 * Body: { projectId, type, content, context?, metadata? }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { projectId, type, content, context, metadata } = body

        // Validate required fields
        if (!projectId || !type || !content) {
            return NextResponse.json({
                error: 'Missing required fields: projectId, type, content'
            }, { status: 400 })
        }

        if (!VALID_TYPES.includes(type)) {
            return NextResponse.json({
                error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`
            }, { status: 400 })
        }

        // Verify access
        const hasAccess = await verifyProjectAccess(session.user.id, projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Create the item
        const input: CreateLearningItemInput = {
            projectId,
            type,
            content,
            context,
            metadata: {
                ...metadata,
                learnedFromUser: session.user.id
            }
        }

        const item = await addLearningItem(input)
        return NextResponse.json({ item }, { status: 201 })

    } catch (error: unknown) {
        console.error('Learning POST error:', error instanceof Error ? error.message : error)
        return NextResponse.json({ error: 'Failed to create learning item' }, { status: 500 })
    }
}

/**
 * PATCH /api/learning
 * Update a learning item
 * Body: { id, content?, context?, metadata? }
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { id, content, context, metadata } = body

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        // Verify ownership
        const item = await db.query.projectLearningPaths.findFirst({
            where: eq(projectLearningPaths.id, id)
        })

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 })
        }

        const hasAccess = await verifyProjectAccess(session.user.id, item.projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Build update object
        const updates: Record<string, unknown> = {}
        if (content !== undefined) updates.content = content
        if (context !== undefined) updates.context = context
        if (metadata !== undefined) updates.metadata = metadata

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
        }

        const updated = await updateLearningItem(id, updates)
        return NextResponse.json({ item: updated })

    } catch (error: unknown) {
        console.error('Learning PATCH error:', error instanceof Error ? error.message : error)
        return NextResponse.json({ error: 'Failed to update learning item' }, { status: 500 })
    }
}

/**
 * DELETE /api/learning?id=xxx
 * Delete a learning item
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        // Verify ownership
        const item = await db.query.projectLearningPaths.findFirst({
            where: eq(projectLearningPaths.id, id)
        })

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 })
        }

        const hasAccess = await verifyProjectAccess(session.user.id, item.projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        const deleted = await deleteLearningItem(id)
        return NextResponse.json({ success: true })

    } catch (error: unknown) {
        console.error('Learning DELETE error:', error instanceof Error ? error.message : error)
        return NextResponse.json({ error: 'Failed to delete learning item' }, { status: 500 })
    }
}
