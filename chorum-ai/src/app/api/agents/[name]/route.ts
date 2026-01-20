import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customAgents } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// DELETE - Remove a custom agent for the current user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> } // Keeping 'name' param for now but using it as ID
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name: id } = await params

    const [deleted] = await db.delete(customAgents)
      .where(and(
        eq(customAgents.id, id),
        eq(customAgents.userId, session.user.id)
      ))
      .returning()

    if (!deleted) {
      return NextResponse.json(
        { error: 'Agent not found or unauthorized' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Failed to delete agent:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    )
  }
}
