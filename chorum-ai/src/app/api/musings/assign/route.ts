import { NextRequest, NextResponse } from 'next/server'
import { authFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { conversations, messages, projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Assign Musing to Project
 * 
 * Specialized endpoint for the Midnight Musings app to move a 
 * captured thought (conversation) into a specific project.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await authFromRequest(req)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { musingId, projectId } = await req.json()

        if (!musingId || !projectId) {
            return NextResponse.json({ error: 'musingId and projectId are required' }, { status: 400 })
        }

        // 1. Verify the conversation (musing) exists and belongs to the user
        // We do this by checking if the current project of the conversation belongs to the user
        const [musing] = await db
            .select({
                id: conversations.id,
                currentProjectId: conversations.projectId
            })
            .from(conversations)
            .innerJoin(projects, eq(conversations.projectId, projects.id))
            .where(and(
                eq(conversations.id, musingId),
                eq(projects.userId, userId)
            ))

        if (!musing) {
            return NextResponse.json({ error: 'Musing not found or unauthorized' }, { status: 404 })
        }

        // 2. Verify the target project belongs to the user
        const [targetProject] = await db
            .select()
            .from(projects)
            .where(and(
                eq(projects.id, projectId),
                eq(projects.userId, userId)
            ))

        if (!targetProject) {
            return NextResponse.json({ error: 'Target project not found or unauthorized' }, { status: 404 })
        }

        // 3. Update the conversation and its messages
        // Chorum schema stores projectId on both tables for performance/isolation
        await db.transaction(async (tx) => {
            // Update conversation
            await tx.update(conversations)
                .set({ projectId, updatedAt: new Date() })
                .where(eq(conversations.id, musingId))

            // Update all messages in this conversation
            await tx.update(messages)
                .set({ projectId })
                .where(eq(messages.conversationId, musingId))
        })

        console.log(`[Musing Assign] Moved musing ${musingId} to project ${projectId} for user ${userId}`)

        return NextResponse.json({
            success: true,
            id: musingId,
            projectId: projectId,
            message: `Musing successfully assigned to project: ${targetProject.name}`
        })

    } catch (error) {
        console.error('[Musing Assign] Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
