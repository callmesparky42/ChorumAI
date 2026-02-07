/**
 * Learning Context Injector
 * Injects learned patterns, invariants, and critical file info using Relevance Gating.
 * Returns cached data to avoid redundant DB calls during validation.
 */

import { getProjectLearning } from './manager'
import { getLinksForProject } from './links'
import { db } from '@/lib/db'
import { projectFileMetadata } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { classifier } from '@/lib/chorum/classifier'
import { embeddings } from '@/lib/chorum/embeddings'
import { relevance, type MemoryCandidate } from '@/lib/chorum/relevance'
import type { LearningItem } from './types'
import { upsertCooccurrence } from './cooccurrence'
import { learningLinks } from '@/lib/db/schema'
import { v4 as uuidv4 } from 'uuid'
import { inArray, and } from 'drizzle-orm'
import { updateLink } from './links'

export interface LearningContext {
    /** Modified system prompt with learning context injected */
    systemPrompt: string
    /** Cached learning items for validation (avoids second DB call) */
    learningItems: LearningItem[]
    /** Items actually injected into the prompt */
    injectedItems: MemoryCandidate[]
    /** Cached critical file paths */
    criticalFiles: string[]
    /** Invariants specifically (common use case) */
    invariants: LearningItem[]
    /** Relevance stats */
    relevance?: {
        complexity: string
        budget: number
        itemsSelected: number
        latencyMs: number
        tier?: number
        tierLabel?: string
    }
}

/**
 * Inject learning context into system prompt using Relevance Gating.
 * 
 * Flow:
 * 1. Classify Query (Complexity, Intent, Budget)
 * 2. Generate Embedding (Local model)
 * 3. Fetch Candidates (Project learning items)
 * 4. Score & Select (Relevance Engine)
 * 5. Formatting (Context Assembly)
 */
import { selectInjectionTier } from '../chorum/tiers'
import { getCachedContext, recompileCache } from './cache'

// ... imports remain the same ...

export async function injectLearningContext(
    basePrompt: string,
    projectId: string,
    userQuery: string,
    userId: string, // Added userId for cache recompilation
    conversationDepth: number = 0,
    contextWindow: number = 128000
): Promise<LearningContext> {
    const start = Date.now()

    // 0. Select Tier
    const tierConfig = selectInjectionTier(contextWindow)

    // TIER 1 or TIER 2: Use pre-compiled cache
    if (tierConfig.tier === 1 || tierConfig.tier === 2) {
        const cached = await getCachedContext(projectId, tierConfig.tier)

        if (cached) {
            // Fast path: inject cached string directly
            const systemPrompt = basePrompt + '\n\n---\n# Project Context\n' + cached

            // Console logging for verification (Task 4.1)
            console.log(`[Chorum] Context tier: ${tierConfig.tier} (${tierConfig.label}) | ` +
                `Model context: ${contextWindow.toLocaleString()} tokens | ` +
                `Budget: ${tierConfig.maxBudget} tokens | ` +
                `Cache: HIT`)

            return {
                systemPrompt,
                learningItems: [],       // Not individually tracked for cached tiers
                injectedItems: [],
                criticalFiles: [],
                invariants: [],
                relevance: {
                    complexity: 'cached',
                    budget: tierConfig.maxBudget,
                    itemsSelected: 0,       // Cache is pre-compiled
                    latencyMs: Date.now() - start,
                    tier: tierConfig.tier,
                    tierLabel: tierConfig.label
                }
            }
        }

        // Cache miss: trigger async recompilation, fall through to Tier 3
        console.log(`[Chorum] Context tier: ${tierConfig.tier} (${tierConfig.label}) | ` +
            `Model context: ${contextWindow.toLocaleString()} tokens | ` +
            `Budget: ${tierConfig.maxBudget} tokens | ` +
            `Cache: MISS → fallback Tier 3`)

        // Don't block the request — compile in background
        recompileCache(projectId, userId).catch(err =>
            console.error('[Cache] Recompilation failed:', err)
        )
        // Fall through to Tier 3 as graceful degradation
    } else {
        // Tier 3 Logging
        console.log(`[Chorum] Context tier: ${tierConfig.tier} (${tierConfig.label}) | ` +
            `Model context: ${contextWindow.toLocaleString()} tokens | ` +
            `Budget: ${tierConfig.maxBudget} tokens | ` +
            `Cache: N/A`)
    }

    // 1. Classify Query (Tier 3 or Fallback Logic)
    const classification = classifier.classify(userQuery, conversationDepth)
    const budget = classifier.calculateBudget(classification)

    // Override budget if we are falling back? 
    // Spec says: "Fall through to Tier 3". Tier 3 uses existing dynamic budget.
    // But if we intended Tier 1/2 and fell back, we might be injecting MORE tokens than Tier 1/2 allowed?
    // Tier 1 allows ~500. Tier 3 logic might give 2000.
    // For an 8K model, 2000 is risky.
    // However, the spec says: "Fall through to Tier 3 as graceful degradation".
    // I will stick to existing logic for fallback, assuming it's better than nothing, 
    // and cache recompilation will fix it for next time.

    // Early exit for trivial queries (e.g. "hi") - just return invariants if any, or nothing
    if (budget.maxTokens === 0) {
        // Ideally we might still want critical invariants?
        // Let's allow minimal invariant injection even for trivial if they are critical?
        // Use a small budget instead of 0 for trivial if safety checks needed?
        // The spec says "Skip for trivial... Inject nothing" but also says "Invariants are high-priority".
        // Let's stick to budget. If budget is 0, inject nothing.
        // However, to keep validation working, we still need to return the items structure.
        // We'll fetch items but select none for prompt.

        // Optimization: If trivial, skip vector embedding.
    }

    // 2. Generate Embedding & Fetch Data (only if budget allows)
    let learningItems: LearningItem[] = []
    let fileMeta: { filePath: string; isCritical: boolean | null; linkedInvariants: string[] | null; projectId: string }[] = []
    let queryEmbedding: number[] = []
    let allLinks: any[] = []

    if (budget.maxTokens > 0) {
        // Parallel execution of all data requirements
        const results = await Promise.all([
            getProjectLearning(projectId),
            db.select().from(projectFileMetadata).where(eq(projectFileMetadata.projectId, projectId)),
            embeddings.embed(userQuery, userId),
            getLinksForProject(projectId)
        ])

        learningItems = results[0]
        fileMeta = results[1]
        queryEmbedding = results[2]
        allLinks = results[3]
    }

    const criticalFiles = fileMeta
        .filter(f => f.isCritical)
        .map(f => f.filePath)

    // Map to MemoryCandidate
    const candidates: MemoryCandidate[] = learningItems.map(item => ({
        id: item.id,
        type: item.type,
        content: item.content,
        context: item.context || null,
        embedding: item.embedding || null,
        domains: item.domains || null,
        usageCount: item.usageCount || 0,
        lastUsedAt: item.lastUsedAt || null,
        createdAt: item.createdAt
    }))

    // 4. Score & Select
    let selectedItems: MemoryCandidate[] = []

    if (budget.maxTokens > 0) {
        let scored = relevance.scoreCandidates(candidates, queryEmbedding, classification)

        // [Graph Expansion] Activation Spreading
        // Boost items linked to high-scoring semantic matches
        if (allLinks.length > 0 && scored.length > 0) {
            const idToScore = new Map(scored.map(s => [s.id, s.score || 0]))
            const itemMap = new Map(scored.map(s => [s.id, s]))

            // Identify seeds (top 10 items with decent score)
            const seeds = scored
                .filter(s => (s.score || 0) > 0.6)
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, 10)

            // Spread activation
            for (const seed of seeds) {
                const seedScore = seed.score || 0

                // Find links FROM seed or TO seed
                const relatedLinks = allLinks.filter(l => l.fromId === seed.id || l.toId === seed.id)

                for (const link of relatedLinks) {
                    const targetId = link.fromId === seed.id ? link.toId : link.fromId
                    const targetItem = itemMap.get(targetId)
                    if (!targetItem) continue

                    // Calculate spread score
                    const strength = Number(link.strength)
                    const spreadScore = seedScore * strength * 0.85 // 15% decay per hop

                    const currentScore = idToScore.get(targetId) || 0

                    if (spreadScore > currentScore) {
                        // Boost the item
                        targetItem.score = spreadScore
                        targetItem.retrievalReason = `Linked to "${seed.content.slice(0, 20)}..." (${link.linkType})`
                        targetItem.linkType = link.linkType
                        idToScore.set(targetId, spreadScore)
                    }
                }
            }

            // Re-sort with new scores (relevance.selectMemory does sorting but we modified direct objects)
            // scoreCandidates returns new objects, so we mutated the objects in `scored` array.
            // selectMemory will see the updated scores.
        }

        selectedItems = relevance.selectMemory(scored, budget.maxTokens)
    } else {
        // Even if budget is 0, we might want to enforce invariants?
        // Let's assume budget 0 means strictly no overhead.
        selectedItems = []
    }

    // 5. Assemble Context
    const learningContextStr = relevance.assembleContext(selectedItems)

    // Build Prompt
    // We append specific critical file section if not part of Relevance Engine (spec put files separate?)
    // Spec Context Assembly included "Active Invariants", "Relevant Patterns".
    // Critical Files are usually separate safety context.
    // Let's append Critical Files manually if they exist, as they are "Tier A" metadata, not vector memory.

    let mixedContext = learningContextStr
    if (criticalFiles.length > 0) {
        const criticalSection = buildCriticalFilesSection(criticalFiles, fileMeta)
        if (mixedContext) mixedContext += `\n\n${criticalSection}`
        else mixedContext = criticalSection
    }

    const systemPrompt = mixedContext
        ? basePrompt + '\n\n---\n# Project Learning Context\n' + mixedContext
        : basePrompt

    const end = Date.now()

    return {
        systemPrompt,
        learningItems: learningItems,
        injectedItems: selectedItems,
        criticalFiles,
        invariants: learningItems.filter(i => i.type === 'invariant'),
        relevance: {
            complexity: classification.complexity,
            budget: budget.maxTokens,
            itemsSelected: selectedItems.length,
            latencyMs: end - start
        }
    }
}

function buildCriticalFilesSection(
    criticalFiles: string[],
    fileMeta: { filePath: string; linkedInvariants: string[] | null }[]
): string {
    let section = '## CRITICAL FILES (Tier A)\nThese files require extra care:\n'
    for (const path of criticalFiles) {
        const meta = fileMeta.find(f => f.filePath === path)
        section += `- \`${path}\``
        if (meta?.linkedInvariants?.length) {
            section += ` (linked to ${meta.linkedInvariants.length} invariant(s))`
        }
        section += '\n'
    }
    return section
}

/**
 * onInjection
 * Tracks co-occurrence of injected items.
 * Should be called after successful response generation.
 */
export async function onInjection(
    injectedItems: LearningItem[],
    projectId: string,
    responseQuality: 'positive' | 'neutral' | 'negative' = 'neutral'
): Promise<void> {
    if (injectedItems.length < 2) return

    // Track all pairs
    const isPositive = responseQuality === 'positive'
    const promises: Promise<void>[] = []

    for (let i = 0; i < injectedItems.length; i++) {
        for (let j = i + 1; j < injectedItems.length; j++) {
            promises.push(upsertCooccurrence({
                projectId,
                itemA: injectedItems[i].id,
                itemB: injectedItems[j].id,
                isPositive
            }))
        }
    }

    // Fire and forget - don't await all individually if not critical? 
    // Ideally await to ensure DB consistency but execution time matters less here (async).
    await Promise.all(promises)

    // Phase 4: Link Strengthening
    if (isPositive) {
        await strengthenUsedLinks(injectedItems, projectId)
    }
}

/**
 * strengthenUsedLinks
 * Increases strength of existing links between successfully used items.
 */
async function strengthenUsedLinks(
    injectedItems: LearningItem[],
    projectId: string
): Promise<void> {
    if (injectedItems.length < 2) return

    const itemIds = injectedItems.map(i => i.id)

    // Find existing links between these items
    const existingLinks = await db.select()
        .from(learningLinks)
        .where(and(
            eq(learningLinks.projectId, projectId),
            or(
                and(inArray(learningLinks.fromId, itemIds), inArray(learningLinks.toId, itemIds))
            )
        ))

    // Update strengths
    for (const link of existingLinks) {
        const current = Number(link.strength)
        // Asymptotic approach strictly < 1.0
        // New = Old + 0.05 * (1 - Old)
        const newStrength = current + 0.05 * (1 - current)

        await updateLink(link.id, { strength: newStrength })
    }
}
