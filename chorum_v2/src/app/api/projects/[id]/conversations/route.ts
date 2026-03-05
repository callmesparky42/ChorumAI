import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { conversations, projects } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const { id } = await params

    // Verify project ownership
    const proj = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, authCtx.userId))
    })
    if (!proj) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const rows = await db
        .select()
        .from(conversations)
        .where(and(
            eq(conversations.userId, authCtx.userId),
            eq(conversations.projectId, id)
        ))
        .orderBy(desc(conversations.updatedAt))
        .limit(50)

    return NextResponse.json(rows.map(r => ({
        id: r.id,
        updated_at: r.updatedAt.toISOString(),
        metadata: r.metadata as { firstMessageSnippet?: string }
    })))
}
