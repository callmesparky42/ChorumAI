/**
 * Learning Queue Processor
 * 
 * Handles async processing of pattern extraction.
 * Uses a simple database-backed queue with setTimeout for processing.
 */

import { db } from '@/lib/db'
import { learningQueue, providerCredentials, users } from '@/lib/db/schema'
import { eq, and, or, lt, sql } from 'drizzle-orm'
import { extractAndStoreLearnings } from './analyzer'
import { decrypt } from '@/lib/crypto'
import type { FullProviderConfig } from '@/lib/providers'

const MAX_ATTEMPTS = 3
const PROCESSING_DELAY_MS = 1000 // 1 second between processing attempts

/**
 * Add a conversation to the learning queue for async processing
 */
export async function queueForLearning(
    projectId: string,
    userId: string,
    userMessage: string,
    assistantResponse: string,
    agentName?: string
): Promise<string> {
    const [inserted] = await db.insert(learningQueue).values({
        projectId,
        userId,
        userMessage,
        assistantResponse,
        agentName,
        status: 'pending'
    }).returning({ id: learningQueue.id })

    // Schedule processing after a short delay
    setTimeout(() => processQueue(userId), PROCESSING_DELAY_MS)

    return inserted.id
}

/**
 * Process pending items in the queue for a user
 */
export async function processQueue(userId?: string): Promise<{ processed: number; failed: number }> {
    let processed = 0
    let failed = 0

    try {
        // Get pending items (optionally filtered by user)
        const whereClause = userId
            ? and(
                eq(learningQueue.status, 'pending'),
                eq(learningQueue.userId, userId),
                lt(learningQueue.attempts, MAX_ATTEMPTS)
            )
            : and(
                eq(learningQueue.status, 'pending'),
                lt(learningQueue.attempts, MAX_ATTEMPTS)
            )

        const pendingItems = await db.select()
            .from(learningQueue)
            .where(whereClause)
            .limit(10) // Process in batches

        for (const item of pendingItems) {
            try {
                // Mark as processing
                await db.update(learningQueue)
                    .set({
                        status: 'processing',
                        attempts: (item.attempts || 0) + 1
                    })
                    .where(eq(learningQueue.id, item.id))

                // Get provider config for this user
                const providerConfig = await getProviderForUser(item.userId)
                if (!providerConfig) {
                    throw new Error('No provider configured for learning extraction')
                }

                // Extract and store learnings
                const result = await extractAndStoreLearnings(
                    item.projectId,
                    item.userMessage,
                    item.assistantResponse,
                    providerConfig
                )

                // Mark as completed
                await db.update(learningQueue)
                    .set({
                        status: 'completed',
                        processedAt: new Date()
                    })
                    .where(eq(learningQueue.id, item.id))

                console.log(`[Queue] Processed item ${item.id}: ${result.stored} stored, ${result.duplicates} duplicates`)
                processed++
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error'

                // Mark as failed or pending for retry
                const newStatus = (item.attempts || 0) + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending'
                await db.update(learningQueue)
                    .set({
                        status: newStatus,
                        error: errorMessage
                    })
                    .where(eq(learningQueue.id, item.id))

                console.error(`[Queue] Failed to process item ${item.id}:`, e)
                failed++
            }
        }
    } catch (e) {
        console.error('[Queue] Error processing queue:', e)
    }

    return { processed, failed }
}

/**
 * Get a cheap provider config for the user (for learning extraction)
 */
async function getProviderForUser(userId: string): Promise<FullProviderConfig | null> {
    // Get user's active providers, preferring cheaper ones
    const providers = await db.select()
        .from(providerCredentials)
        .where(
            and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            )
        )

    if (providers.length === 0) {
        return null
    }

    // Prefer cheaper models for background processing
    const cheapOrder = ['deepseek', 'mistral', 'openai', 'anthropic', 'google']
    const sorted = providers.sort((a, b) => {
        return cheapOrder.indexOf(a.provider) - cheapOrder.indexOf(b.provider)
    })

    const selected = sorted[0]

    return {
        provider: selected.provider,
        apiKey: decrypt(selected.apiKeyEncrypted),
        model: selected.model,
        baseUrl: selected.baseUrl || undefined,
        isLocal: selected.isLocal || false
    }
}

/**
 * Clean up old completed/failed items (run periodically)
 */
export async function cleanupQueue(daysOld: number = 7): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysOld)

    const result = await db.delete(learningQueue)
        .where(
            and(
                or(
                    eq(learningQueue.status, 'completed'),
                    eq(learningQueue.status, 'failed')
                ),
                lt(learningQueue.createdAt, cutoff)
            )
        )

    return 0 // Drizzle doesn't return count easily
}

/**
 * Get queue stats for a user
 */
export async function getQueueStats(userId: string): Promise<{
    pending: number
    processing: number
    completed: number
    failed: number
}> {
    const items = await db.select({
        status: learningQueue.status,
        count: sql<number>`count(*)`
    })
        .from(learningQueue)
        .where(eq(learningQueue.userId, userId))
        .groupBy(learningQueue.status)

    const stats = { pending: 0, processing: 0, completed: 0, failed: 0 }
    for (const item of items) {
        if (item.status in stats) {
            stats[item.status as keyof typeof stats] = Number(item.count)
        }
    }

    return stats
}
