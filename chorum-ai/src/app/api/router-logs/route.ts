
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { routingLog, projects } from '@/lib/db/schema'
import { desc, eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Ideally check for admin role here, but for now we restrict to own logs
        // or just allow all if user is "admin" (which we don't have distinct role for yet)
        // Let's return logs for the current user.

        const logs = await db
            .select({
                id: routingLog.id,
                projectId: routingLog.projectId,
                projectName: projects.name,
                taskType: routingLog.taskType,
                selectedProvider: routingLog.selectedProvider,
                reasoning: routingLog.reasoning,
                alternatives: routingLog.alternatives,
                userOverride: routingLog.userOverride,
                createdAt: routingLog.createdAt
            })
            .from(routingLog)
            .leftJoin(projects, eq(routingLog.projectId, projects.id))
            .where(eq(routingLog.userId, session.user.id))
            .orderBy(desc(routingLog.createdAt))
            .limit(50)

        return NextResponse.json(logs)
    } catch (error) {
        console.error('Failed to fetch routing logs:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
