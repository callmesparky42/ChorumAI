// src/lib/core/conductor/queue.ts
// Conductor queue and zombie recovery.
// CRITICAL: zombie recovery must be scheduled — serverless timeouts leave items stuck.

import { db } from '@/db'
import { conductorQueue } from '@/db/schema'
import { eq, and, lt, sql, isNotNull } from 'drizzle-orm'

export type QueueJobType = 'signal_processing' | 'lm_judge' | 'compaction'

export async function enqueue(
    userId: string,
    type: QueueJobType,
    payload: Record<string, unknown>,
): Promise<void> {
    await db.insert(conductorQueue).values({ userId, type, payload, status: 'pending' })
}

export async function claimNext(userId: string): Promise<typeof conductorQueue.$inferSelect | null> {
    const [row] = await db
        .update(conductorQueue)
        .set({ status: 'processing', lockedAt: new Date() })
        .where(
            and(
                eq(conductorQueue.userId, userId),
                eq(conductorQueue.status, 'pending'),
            )
        )
        .returning()

    return row ?? null
}

export async function markComplete(id: string): Promise<void> {
    await db.update(conductorQueue).set({ status: 'completed' }).where(eq(conductorQueue.id, id))
}

export async function markFailed(id: string): Promise<void> {
    await db
        .update(conductorQueue)
        .set({ status: 'failed', attempts: sql`${conductorQueue.attempts} + 1` })
        .where(eq(conductorQueue.id, id))
}

/**
 * Zombie recovery — resets items stuck in 'processing' for > 10 minutes.
 * Run every 5 minutes via /api/cron/zombie-recovery.
 */
export async function recoverZombies(): Promise<number> {
    const threshold = new Date(Date.now() - 10 * 60 * 1000)

    const result = await db
        .update(conductorQueue)
        .set({
            status: 'pending',
            lockedAt: null,
            attempts: sql`${conductorQueue.attempts} + 1`,
        })
        .where(
            and(
                eq(conductorQueue.status, 'processing'),
                isNotNull(conductorQueue.lockedAt),
                lt(conductorQueue.lockedAt, threshold),
            )
        )
        .returning()

    return result.length
}
