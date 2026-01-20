import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { messages, projects, conversations } from '@/lib/db/schema'
import { desc, eq, and, sql, count } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const projectId = req.nextUrl.searchParams.get('projectId')
        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        // Verify user owns the project
        const [project] = await db.select().from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Get real conversations from the conversations table
        const conversationList = await db
            .select({
                id: conversations.id,
                title: conversations.title,
                createdAt: conversations.createdAt,
                updatedAt: conversations.updatedAt,
                messageCount: sql<number>`(
                    SELECT COUNT(*) FROM messages
                    WHERE messages.conversation_id = ${conversations.id}
                )`.as('message_count'),
                preview: sql<string>`(
                    SELECT content FROM messages
                    WHERE messages.conversation_id = ${conversations.id}
                      AND messages.role = 'user'
                    ORDER BY messages.created_at ASC
                    LIMIT 1
                )`.as('preview')
            })
            .from(conversations)
            .where(eq(conversations.projectId, projectId))
            .orderBy(desc(conversations.updatedAt))
            .limit(50)

        // Transform to consistent format
        const result = conversationList.map(c => ({
            id: c.id,
            title: c.title || (c.preview ? truncatePreview(c.preview) : 'New Conversation'),
            preview: c.preview,
            messageCount: Number(c.messageCount) || 0,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
        }))

        return NextResponse.json(result)
    } catch (error) {
        console.error('Error fetching conversations:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

function truncatePreview(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (cleaned.length <= 40) return cleaned
    const truncated = cleaned.substring(0, 40)
    const lastSpace = truncated.lastIndexOf(' ')
    return lastSpace > 20 ? truncated.substring(0, lastSpace) + '...' : truncated + '...'
}
