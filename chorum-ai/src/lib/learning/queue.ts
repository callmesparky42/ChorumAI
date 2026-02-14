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
import { getCheapModel, BACKGROUND_PROVIDER_PREFERENCE } from '@/lib/providers/registry'

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

        // Recovery: Reset stuck "processing" items older than 10 minutes
        // This handles serverless timeouts where items get stuck in processing forever
        const zombieCutoff = new Date(Date.now() - 10 * 60 * 1000)
        await db.update(learningQueue)
            .set({ status: 'pending' })
            .where(and(
                eq(learningQueue.status, 'processing'),
                lt(learningQueue.createdAt, zombieCutoff)
            ))

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
                    project?.focusDomains ?? [],
                    item.agentName || 'web-ui' // Pass source/agentName
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

    // Check if there are more items to process (drain the queue)
    const [remaining] = await db.select()
        .from(learningQueue)
        .where(
            and(
                eq(learningQueue.status, 'pending'),
                lt(learningQueue.attempts, MAX_ATTEMPTS)
            )
        )
        .limit(1)

    if (remaining) {
        setTimeout(() => processQueue(userId), PROCESSING_DELAY_MS)
    }

    return { processed, failed }
}

/**
 * Queue multiple conversation pairs for learning extraction as a batch.
 * Used by import pipelines to trigger learning on intake.
 * Returns batch ID for progress tracking.
 */
export async function queueBatchForLearning(
    projectId: string,
    userId: string,
    pairs: Array<{ userMessage: string; assistantResponse: string }>,
    label?: string,
    agentName?: string
): Promise<{ batchId: string; queued: number }> {
    const batchId = crypto.randomUUID()
    const batchLabel = label || `Import batch (${pairs.length} conversations)`

    // Filter valid pairs
    const validPairs = pairs.filter(p =>
        p.userMessage.trim().length >= 20 &&
        p.assistantResponse.trim().length >= 20
    )

    if (validPairs.length === 0) {
        return { batchId, queued: 0 }
    }

    // Insert in a single query
    await db.insert(learningQueue).values(
        validPairs.map(p => ({
            projectId,
            userId,
            userMessage: p.userMessage,
            assistantResponse: p.assistantResponse,
            status: 'pending',
            batchId,
            batchLabel,
            agentName
        }))
    )

    // Schedule processing
    setTimeout(() => processQueue(userId), PROCESSING_DELAY_MS)

    return { batchId, queued: validPairs.length }
}

/**
 * Get progress for a specific batch of queued learning extractions.
 */
export async function getBatchProgress(batchId: string): Promise<{
    batchId: string
    label: string | null
    total: number
    pending: number
    processing: number
    completed: number
    failed: number
    errors: string[]
}> {
    const items = await db.select({
        status: learningQueue.status,
        error: learningQueue.error,
        label: learningQueue.batchLabel
    })
        .from(learningQueue)
        .where(eq(learningQueue.batchId, batchId))

    const stats = {
        batchId,
        label: items[0]?.label || null,
        total: items.length,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        errors: [] as string[]
    }

    const errorSet = new Set<string>()

    for (const item of items) {
        if (item.status === 'pending') stats.pending++
        else if (item.status === 'processing') stats.processing++
        else if (item.status === 'completed') stats.completed++
        else if (item.status === 'failed') stats.failed++

        if (item.error) errorSet.add(item.error)
    }

    stats.errors = Array.from(errorSet)

    return stats
}

/**
 * Get a cheap provider config for the user (for learning extraction)
 * 
 * Priority:
 * 1. User's configured cloud providers (cheaper ones first)
 * 2. Environment API keys (Anthropic, OpenAI, Google)
 * 3. Local providers if explicitly configured with a specific model
 */
// ... existing code ...

// ... existing code ...

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

    // Helper to find a provider
    const findProvider = (providerName: string): FullProviderConfig | null => {
        const cred = cloudProviders.find(p => p.provider === providerName)
        if (!cred) return null
        return {
            provider: cred.provider,
            apiKey: decrypt(cred.apiKeyEncrypted),
            model: getCheapModel(cred.provider),
            baseUrl: cred.baseUrl || undefined,
            isLocal: false
        }
    }

    // Check providers in preference order
    for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
        const config = findProvider(provider)
        if (config) return config
    }

    // Fall back to environment API keys (cheap models for background tasks)
    // We iterate the same preference list to check env vars
    for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
        const envKey = `${provider.toUpperCase()}_API_KEY`
        // Special case for Google env var name mismatch if needed, but standardizing on PROVIDER_API_KEY is better
        // The original code used GOOGLE_AI_API_KEY
        const apiKey = process.env[envKey] || (provider === 'google' ? process.env.GOOGLE_AI_API_KEY : undefined)

        if (apiKey) {
            return {
                provider,
                apiKey,
                model: getCheapModel(provider),
                isLocal: false
            }
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
