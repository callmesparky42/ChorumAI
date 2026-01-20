import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { messages, conversations, projects } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id: conversationId } = await params

        // Get the conversation and verify ownership
        const [conversation] = await db
            .select({
                id: conversations.id,
                projectId: conversations.projectId,
                title: conversations.title
            })
            .from(conversations)
            .innerJoin(projects, eq(conversations.projectId, projects.id))
            .where(
                and(
                    eq(conversations.id, conversationId),
                    eq(projects.userId, session.user.id)
                )
            )

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
        }

        // Get all messages for this conversation
        const conversationMessages = await db
            .select({
                id: messages.id,
                role: messages.role,
                content: messages.content,
                provider: messages.provider,
                costUsd: messages.costUsd,
                tokensInput: messages.tokensInput,
                tokensOutput: messages.tokensOutput,
                createdAt: messages.createdAt
            })
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(asc(messages.createdAt))

        return NextResponse.json({
            conversation: {
                id: conversation.id,
                projectId: conversation.projectId,
                title: conversation.title
            },
            messages: conversationMessages
        })
    } catch (error) {
        console.error('Error fetching conversation messages:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
