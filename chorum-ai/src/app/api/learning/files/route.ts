/**
 * Critical Files API
 * Manage critical (Tier A) file designations
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, projectFileMetadata } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { setCriticalFile, removeCriticalFile, getCriticalFiles } from '@/lib/learning/manager'

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
 * GET /api/learning/files?projectId=xxx
 * Get all critical files for a project
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

        const hasAccess = await verifyProjectAccess(session.user.id, projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Get full file metadata (not just paths)
        const files = await db.select()
            .from(projectFileMetadata)
            .where(eq(projectFileMetadata.projectId, projectId))

        return NextResponse.json({ files })

    } catch (error: any) {
        console.error('Critical files GET error:', error)
        return NextResponse.json({ error: 'Failed to fetch critical files' }, { status: 500 })
    }
}

/**
 * POST /api/learning/files
 * Mark a file as critical
 * Body: { projectId, filePath, isCritical?, linkedInvariants? }
 */
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await req.json()
        const { projectId, filePath, isCritical = true, linkedInvariants } = body

        if (!projectId || !filePath) {
            return NextResponse.json({
                error: 'Missing required fields: projectId, filePath'
            }, { status: 400 })
        }

        const hasAccess = await verifyProjectAccess(session.user.id, projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        await setCriticalFile({
            projectId,
            filePath,
            isCritical,
            linkedInvariants
        })

        return NextResponse.json({ success: true }, { status: 201 })

    } catch (error: any) {
        console.error('Critical files POST error:', error)
        return NextResponse.json({ error: 'Failed to set critical file' }, { status: 500 })
    }
}

/**
 * DELETE /api/learning/files?projectId=xxx&filePath=xxx
 * Remove critical file designation
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get('projectId')
        const filePath = searchParams.get('filePath')

        if (!projectId || !filePath) {
            return NextResponse.json({
                error: 'projectId and filePath are required'
            }, { status: 400 })
        }

        const hasAccess = await verifyProjectAccess(session.user.id, projectId)
        if (!hasAccess) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const deleted = await removeCriticalFile(projectId, filePath)
        if (!deleted) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 })
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('Critical files DELETE error:', error)
        return NextResponse.json({ error: 'Failed to remove critical file' }, { status: 500 })
    }
}
