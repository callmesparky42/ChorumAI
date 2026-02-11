/**
 * Learning Queue Processor
 * 
 * Handles async processing of pattern extraction.
 * Uses a simple database-backed queue with setTimeout for processing.
 */

import { db } from '@/lib/db'
import { learningQueue, providerCredentials, projects, users } from '@/lib/db/schema'
import { eq, and, or, lt, sql } from 'drizzle-orm'
import { extractAndStoreLearnings } from './analyzer'
import { decrypt } from '@/lib/crypto'
import type { FullProviderConfig } from '@/lib/providers'
import { getOrComputeDomainSignal } from '@/lib/chorum/domainSignal'

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

                const [project] = await db
                    .select({ focusDomains: projects.focusDomains })
                    .from(projects)
                    .where(eq(projects.id, item.projectId))
                    .limit(1)

                const domainSignal = await getOrComputeDomainSignal(item.projectId)

                // Extract and store learnings
                const result = await extractAndStoreLearnings(
                    item.projectId,
                    item.userMessage,
                    item.assistantResponse,
                    providerConfig,
                    undefined, // projectContext
                    undefined, // sourceMessageId
                    item.userId,
                    domainSignal,
                    project?.focusDomains ?? []
                )

                // Mark as completed
                await db.update(learningQueue)
                    .set({
                        status: 'completed',
                        processedAt: new Date()
                    })
                    .where(eq(learningQueue.id, item.id))

                console.log(`[Queue] Processed item ${item.id}: ${result.stored} stored, ${result.duplicates} duplicates, ${result.merged} merged`)
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
 * 
 * Priority:
 * 1. User's configured cloud providers (cheaper ones first)
 * 2. Environment API keys (Anthropic, OpenAI, Google)
 * 3. Local providers if explicitly configured with a specific model
 */
async function getProviderForUser(userId: string): Promise<FullProviderConfig | null> {
    // Get user's active providers
    const providers = await db.select()
        .from(providerCredentials)
        .where(
            and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            )
        )

    // Separate cloud and local providers
    const cloudProviders = providers.filter(p => !p.isLocal)
    const localProviders = providers.filter(p => p.isLocal)

    // Prefer cheaper cloud models for background processing
    const cheapOrder = ['deepseek', 'mistral', 'google', 'openai', 'anthropic', 'perplexity', 'xai', 'glm']
    const sortedCloud = cloudProviders.sort((a, b) => {
        const aIndex = cheapOrder.indexOf(a.provider)
        const bIndex = cheapOrder.indexOf(b.provider)
        return (aIndex === -1 ? 100 : aIndex) - (bIndex === -1 ? 100 : bIndex)
    })

    // Use a cloud provider if available
    if (sortedCloud.length > 0) {
        const selected = sortedCloud[0]
        return {
            provider: selected.provider,
            apiKey: decrypt(selected.apiKeyEncrypted),
            model: selected.model,
            baseUrl: selected.baseUrl || undefined,
            isLocal: false
        }
    }

    // Fall back to environment API keys (cheap models for background tasks)
    if (process.env.GOOGLE_AI_API_KEY) {
        return {
            provider: 'google',
            apiKey: process.env.GOOGLE_AI_API_KEY,
            model: 'gemini-2.0-flash-lite',
            isLocal: false
        }
    }
    if (process.env.ANTHROPIC_API_KEY) {
        return {
            provider: 'anthropic',
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: 'claude-3-haiku-20240307',
            isLocal: false
        }
    }
    if (process.env.OPENAI_API_KEY) {
        return {
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini',
            isLocal: false
        }
    }

    // Only use local providers if explicitly configured with a real model (not 'auto')
    // This avoids the "llama3.3 not found" issue when model resolves to default
    if (localProviders.length > 0) {
        const selected = localProviders[0]
        // Skip if model is 'auto' or empty (would resolve to hardcoded default)
        if (!selected.model || selected.model === 'auto') {
            console.warn(`[Queue] Skipping local provider ${selected.provider} - no specific model configured`)
            return null
        }
        console.log(`[Queue] Using local provider ${selected.provider} with model ${selected.model}`)
        return {
            provider: selected.provider,
            apiKey: '',
            model: selected.model,
            baseUrl: selected.baseUrl || undefined,
            isLocal: true
        }
    }

    // No providers available
    console.warn('[Queue] No providers available for learning extraction')
    return null
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
