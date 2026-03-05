import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

function rowToProject(r: typeof projects.$inferSelect) {
    const sf = r.scopeFilter as any
    return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        scopeFilter: { include: sf?.include ?? [], exclude: sf?.exclude ?? [] },
        crossLensAccess: r.crossLensAccess,
        settings: (r.settings as Record<string, unknown>) ?? {},
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
    }
}

export async function GET(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, authCtx.userId))
        .orderBy(desc(projects.updatedAt))

    return NextResponse.json(rows.map(rowToProject))
}

const CreateProjectSchema = z.object({
    name: z.string().min(1).max(100),
    scopeFilter: z.object({
        include: z.array(z.string()),
        exclude: z.array(z.string()),
    }).optional(),
    crossLensAccess: z.boolean().optional(),
})

export async function POST(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const parsed = CreateProjectSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

    const sf = parsed.data.scopeFilter ?? { include: [], exclude: [] }
    const [row] = await db
        .insert(projects)
        .values({
            userId: authCtx.userId,
            name: parsed.data.name,
            scopeFilter: sf,
            crossLensAccess: parsed.data.crossLensAccess ?? false,
        })
        .returning()

    if (!row) return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
    return NextResponse.json(rowToProject(row), { status: 201 })
}
