import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { messages, projects } from '@/lib/db/schema'
import { desc, eq, and, sql } from 'drizzle-orm'
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

        // Get conversations - group messages by date to create "conversation threads"
        // Each distinct day of conversation is a "thread" for now
        const conversations = await db
            .select({
                date: sql<string>`DATE(${messages.createdAt})`.as('conversation_date'),
                firstMessageId: sql<string>`MIN(${messages.id})`.as('first_msg'),
                lastMessageAt: sql<Date>`MAX(${messages.createdAt})`.as('last_msg'),
                messageCount: sql<number>`COUNT(*)`.as('msg_count'),
                preview: sql<string>`(
                    SELECT content FROM messages m2 
                    WHERE m2.project_id = ${projectId} 
                      AND DATE(m2.created_at) = DATE(${messages.createdAt})
                      AND m2.role = 'user'
                    ORDER BY m2.created_at ASC
                    LIMIT 1
                )`.as('preview')
            })
            .from(messages)
            .where(eq(messages.projectId, projectId))
            .groupBy(sql`DATE(${messages.createdAt})`)
            .orderBy(desc(sql`DATE(${messages.createdAt})`))
            .limit(20)

        return NextResponse.json(conversations)
    } catch (error) {
        console.error('Error fetching conversations:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
