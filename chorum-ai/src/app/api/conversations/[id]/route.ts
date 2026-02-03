import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { conversations, projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const conversationId = params.id
        if (!conversationId) {
            return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
        }

        // 1. Get the conversation to find its project ID
        const [conversation] = await db
            .select({ projectId: conversations.projectId })
            .from(conversations)
            .where(eq(conversations.id, conversationId))

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
        }

        // 2. Verify user owns the project
        const [project] = await db
            .select()
            .from(projects)
            .where(and(
                eq(projects.id, conversation.projectId),
                eq(projects.userId, session.user.id)
            ))

        if (!project) {
            return NextResponse.json({ error: 'Unauthorized access to project' }, { status: 403 })
        }

        // 3. Delete the conversation
        // Messages will be deleted automatically via ON DELETE CASCADE in Postgres
        await db.delete(conversations)
            .where(eq(conversations.id, conversationId))

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting conversation:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
