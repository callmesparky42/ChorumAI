
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { compactLearnings } from '@/lib/learning/compactor'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
        const body = await req.json()
        const { projectId } = body

        if (!projectId) {
            return new NextResponse('Project ID required', { status: 400 })
        }

        // Verify ownership/access
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return new NextResponse('Project not found or access denied', { status: 404 })
        }

        const result = await compactLearnings(projectId)

        return NextResponse.json(result)
    } catch (error) {
        console.error('[API] Compaction failed:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
