import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectDocuments, projects, projectLearningPaths } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

/**
 * GET /api/documents?projectId=xxx
 * List all active documents for a project
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

        // Get all active documents for this project
        const documents = await db.select({
            id: projectDocuments.id,
            filename: projectDocuments.filename,
            mimeType: projectDocuments.mimeType,
            uploadedAt: projectDocuments.uploadedAt,
            status: projectDocuments.status,
            extractedLearningIds: projectDocuments.extractedLearningIds,
            metadata: projectDocuments.metadata
        })
            .from(projectDocuments)
            .where(
                and(
                    eq(projectDocuments.projectId, projectId),
                    eq(projectDocuments.status, 'active')
                )
            )
            .orderBy(projectDocuments.uploadedAt)

        return NextResponse.json(documents)
    } catch (error) {
        console.error('Documents GET error:', error)
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }
}

/**
 * DELETE /api/documents?id=xxx&cascade=true
 * Archive a document, optionally deleting linked learnings
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const documentId = searchParams.get('id')
        const cascade = searchParams.get('cascade') === 'true'

        if (!documentId) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        // Find the document and verify ownership via project
        const document = await db.select({
            id: projectDocuments.id,
            projectId: projectDocuments.projectId,
            filename: projectDocuments.filename,
            extractedLearningIds: projectDocuments.extractedLearningIds
        })
            .from(projectDocuments)
            .where(eq(projectDocuments.id, documentId))
            .limit(1)

        if (!document[0]) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // Verify user owns the project
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, document[0].projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
        }

        // If cascade delete is requested, delete linked learnings first
        let deletedLearnings = 0
        if (cascade && document[0].extractedLearningIds && document[0].extractedLearningIds.length > 0) {
            const result = await db.delete(projectLearningPaths)
                .where(
                    and(
                        eq(projectLearningPaths.projectId, document[0].projectId),
                        inArray(projectLearningPaths.id, document[0].extractedLearningIds)
                    )
                )
            deletedLearnings = document[0].extractedLearningIds.length
            console.log(`[Documents] Cascade deleted ${deletedLearnings} linked learnings for document ${documentId}`)
        }

        // Archive the document (soft delete)
        await db.update(projectDocuments)
            .set({ status: 'archived' })
            .where(eq(projectDocuments.id, documentId))

        console.log(`[Documents] Archived document ${documentId} (${document[0].filename})`)

        return NextResponse.json({
            success: true,
            documentId,
            archived: true,
            deletedLearnings
        })
    } catch (error) {
        console.error('Documents DELETE error:', error)
        return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }
}

/**
 * GET /api/documents/[id]/content
 * Get the full content of a document (for re-using in conversations)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { documentId } = await req.json()

        if (!documentId) {
            return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
        }

        // Find the document
        const document = await db.select()
            .from(projectDocuments)
            .where(eq(projectDocuments.id, documentId))
            .limit(1)

        if (!document[0]) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // Verify user owns the project
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, document[0].projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }

        return NextResponse.json({
            id: document[0].id,
            filename: document[0].filename,
            content: document[0].content,
            mimeType: document[0].mimeType
        })
    } catch (error) {
        console.error('Documents POST error:', error)
        return NextResponse.json({ error: 'Failed to fetch document content' }, { status: 500 })
    }
}
