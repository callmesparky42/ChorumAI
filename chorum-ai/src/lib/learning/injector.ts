/**
 * Learning Context Injector
 * Injects learned patterns, invariants, and critical file info using Relevance Gating.
 * Returns cached data to avoid redundant DB calls during validation.
 */

import { getProjectLearning } from './manager'
import { db } from '@/lib/db'
import { projectFileMetadata } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { classifier } from '@/lib/chorum/classifier'
import { embeddings } from '@/lib/chorum/embeddings'
import { relevance, type MemoryCandidate } from '@/lib/chorum/relevance'
import type { LearningItem } from './types'

export interface LearningContext {
    /** Modified system prompt with learning context injected */
    systemPrompt: string
    /** Cached learning items for validation (avoids second DB call) */
    learningItems: LearningItem[]
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
export async function injectLearningContext(
    basePrompt: string,
    projectId: string,
    userQuery: string,
    conversationDepth: number = 0
): Promise<LearningContext> {
    const start = Date.now()

    // 1. Classify Query
    const classification = classifier.classify(userQuery, conversationDepth)
    const budget = classifier.calculateBudget(classification)

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

    // 2. Generate Embedding (Parallel with DB fetch)
    const embeddingPromise = budget.maxTokens > 0 ? embeddings.embed(userQuery) : Promise.resolve([])

    // 3. Fetch Candidates & File Metadata
    const [learningItems, fileMeta, queryEmbedding] = await Promise.all([
        getProjectLearning(projectId),
        db.select().from(projectFileMetadata).where(eq(projectFileMetadata.projectId, projectId)),
        embeddingPromise
    ])

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
        const scored = relevance.scoreCandidates(candidates, queryEmbedding, classification)
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
        learningItems: learningItems, // Return ALL items for validator (it checks everything against response)
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
