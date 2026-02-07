
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths } from '@/lib/db/schema'
import { eq, and, desc, like, or } from 'drizzle-orm'
import { embeddings } from '@/lib/chorum/embeddings'

// GET /api/cli/memory - List memory items
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        // Dev bypass or auth check
        if (!session?.user?.id && process.env.NODE_ENV === 'development') {
            // pass
        } else if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get('projectId')
        const type = searchParams.get('type')
        const limit = parseInt(searchParams.get('limit') || '20')

        let whereClause = undefined
        if (projectId && type) {
            whereClause = and(
                eq(projectLearningPaths.projectId, projectId),
                eq(projectLearningPaths.type, type)
            )
        } else if (projectId) {
            whereClause = eq(projectLearningPaths.projectId, projectId)
        } else if (type) {
            whereClause = eq(projectLearningPaths.type, type)
        }

        const items = await db.query.projectLearningPaths.findMany({
            where: whereClause,
            orderBy: [desc(projectLearningPaths.createdAt)],
            limit
        })

        return NextResponse.json(items)
    } catch (error) {
        console.error('List memory failed:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// POST /api/cli/memory - Add memory item
export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id && process.env.NODE_ENV !== 'development') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use user ID from session or mock if dev
        const userId = session?.user?.id || 'dev-user'

        const body = await req.json()
        const { content, type, projectId, domains } = body

        if (!content || !projectId) {
            return NextResponse.json({ error: 'Content and Project ID required' }, { status: 400 })
        }

        // Generate embedding
        let embedding: number[] | null = null
        try {
            embedding = await embeddings.embed(content, userId)
        } catch (e) {
            console.warn('Embedding generation failed:', e)
        }

        const [newItem] = await db.insert(projectLearningPaths).values({
            projectId,
            type: type || 'ratio', // default type? 'pattern' usually
            content,
            domains: domains || [],
            embedding,
            usageCount: 0
        }).returning()

        return NextResponse.json(newItem)
    } catch (error) {
        console.error('Add memory failed:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
