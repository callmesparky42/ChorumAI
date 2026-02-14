import { authFromRequest } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { learningQueue } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getBatchProgress, getQueueStats } from '@/lib/learning/queue'

export async function GET(req: NextRequest) {
    const session = await authFromRequest(req)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const searchParams = req.nextUrl.searchParams
    const batchId = searchParams.get('batchId')
    const stats = searchParams.get('stats')

    if (stats === 'true') {
        const queueStats = await getQueueStats(userId)
        return NextResponse.json(queueStats)
    }

    if (batchId) {
        // Verify batch ownership (at least one item MUST belong to user)
        const [item] = await db.select({ id: learningQueue.id })
            .from(learningQueue)
            .where(and(
                eq(learningQueue.batchId, batchId),
                eq(learningQueue.userId, userId)
            ))
            .limit(1)

        if (!item) {
            return NextResponse.json({ error: 'Batch not found or access denied' }, { status: 404 })
        }

        const progress = await getBatchProgress(batchId)
        return NextResponse.json(progress)
    }

    return NextResponse.json({ error: 'Missing batchId or stats parameter' }, { status: 400 })
}
