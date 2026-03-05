import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const { id } = await params
    const row = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, id), eq(conversations.userId, authCtx.userId))
    })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const meta = row.metadata as Record<string, unknown> | null
    const messages = Array.isArray(meta?.messages) ? meta.messages : []
    return NextResponse.json({ messages })
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const { id } = await params
    const row = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, id), eq(conversations.userId, authCtx.userId))
    })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.delete(conversations).where(eq(conversations.id, id))
    return new Response(null, { status: 204 })
}
