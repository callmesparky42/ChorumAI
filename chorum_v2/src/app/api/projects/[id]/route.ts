import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
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

const UpdateProjectSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    scopeFilter: z.object({
        include: z.array(z.string()),
        exclude: z.array(z.string()),
    }).optional(),
    crossLensAccess: z.boolean().optional(),
})

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const { id } = await params
    const existing = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, authCtx.userId))
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() }
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.scopeFilter !== undefined) patch.scopeFilter = parsed.data.scopeFilter
    if (parsed.data.crossLensAccess !== undefined) patch.crossLensAccess = parsed.data.crossLensAccess

    const [row] = await db
        .update(projects)
        .set(patch)
        .where(eq(projects.id, id))
        .returning()

    if (!row) return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    return NextResponse.json(rowToProject(row))
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const { id } = await params
    const existing = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.userId, authCtx.userId))
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.delete(projects).where(eq(projects.id, id))
    return new Response(null, { status: 204 })
}
