import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pendingLearnings, projects, projectLearningPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { embeddings } from '@/lib/chorum/embeddings'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pending = await db
      .select({
        id: pendingLearnings.id,
        projectId: pendingLearnings.projectId,
        projectName: projects.name,
        type: pendingLearnings.type,
        content: pendingLearnings.content,
        context: pendingLearnings.context,
        source: pendingLearnings.source,
        createdAt: pendingLearnings.createdAt
      })
      .from(pendingLearnings)
      .leftJoin(projects, eq(pendingLearnings.projectId, projects.id))
      .where(
        and(
          eq(pendingLearnings.userId, session.user.id),
          eq(pendingLearnings.status, 'pending')
        )
      )
      .orderBy(pendingLearnings.createdAt)
      .limit(50)

    return NextResponse.json({ pending })
  } catch (error) {
    console.error('[MCP] Failed to get pending learnings:', error)
    return NextResponse.json({ error: 'Failed to get pending learnings' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, action, notes, editedContent } = await request.json()

    if (!['approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get the pending learning
    const [pending] = await db
      .select()
      .from(pendingLearnings)
      .where(
        and(
          eq(pendingLearnings.id, id),
          eq(pendingLearnings.userId, session.user.id),
          eq(pendingLearnings.status, 'pending')
        )
      )
      .limit(1)

    if (!pending) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (action === 'approve') {
      // Generate embedding for the content
      const content = editedContent || pending.content
      const embedding = await embeddings.embed(content)

      // Move to project learning paths
      await db.insert(projectLearningPaths).values({
        projectId: pending.projectId,
        type: pending.type,
        content: content,
        context: pending.context,
        source: pending.source,
        embedding: embedding,
        domains: []
      })
    }

    // Update pending status
    await db
      .update(pendingLearnings)
      .set({
        status: action === 'approve' ? 'approved' : 'denied',
        reviewedAt: new Date(),
        reviewerNotes: notes
      })
      .where(eq(pendingLearnings.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MCP] Failed to process pending learning:', error)
    return NextResponse.json({ error: 'Failed to process pending learning' }, { status: 500 })
  }
}
