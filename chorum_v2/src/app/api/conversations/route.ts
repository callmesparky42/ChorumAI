import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { conversations, projects } from '@/db/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { LocalChorumClient } from '@/lib/customization'
import { z } from 'zod'

export async function GET(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const url = new URL(request.url)
    const unassigned = url.searchParams.get('unassigned') === 'true'

    const where = unassigned
        ? and(eq(conversations.userId, authCtx.userId), isNull(conversations.projectId))
        : eq(conversations.userId, authCtx.userId)

    const rows = await db
        .select()
        .from(conversations)
        .where(where)
        .orderBy(desc(conversations.updatedAt))
        .limit(unassigned ? 20 : 50)

    return NextResponse.json(rows.map(r => ({
        id: r.id,
        updated_at: r.updatedAt.toISOString(),
        metadata: r.metadata as { firstMessageSnippet?: string }
    })))
}

const StartSessionSchema = z.object({
    initialQuery: z.string().optional(),
    projectId: z.string().uuid().optional(),
})

export async function POST(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    let body: unknown
    try { body = await request.json() } catch { body = {} }

    const parsed = StartSessionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

    if (parsed.data.projectId) {
        const proj = await db.query.projects.findFirst({
            where: and(eq(projects.id, parsed.data.projectId), eq(projects.userId, authCtx.userId))
        })
        if (!proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const client = new LocalChorumClient(authCtx)
    const res = await client.startSession({
        userId: authCtx.userId,
        initialQuery: parsed.data.initialQuery,
        contextWindowSize: 8192,
    })

    if (parsed.data.projectId) {
        const proj = await db.query.projects.findFirst({
            where: eq(projects.id, parsed.data.projectId)
        })
        const sf = proj?.scopeFilter as any
        const scopeTags = sf?.include ?? []
        await db.update(conversations)
            .set({ projectId: parsed.data.projectId, scopeTags })
            .where(eq(conversations.id, res.conversationId))
    }

    return NextResponse.json(res, { status: 201 })
}
