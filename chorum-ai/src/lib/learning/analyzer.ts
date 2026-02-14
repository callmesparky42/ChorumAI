/**
 * Pattern Analyzer
 * 
 * Extracts patterns, decisions, and invariants from conversations
 * using an LLM call. This is the "Write Path" for semantic memory.
 */

import { db } from '@/lib/db'
import { projectLearningPaths, pendingLearnings } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { callProvider, type FullProviderConfig } from '@/lib/providers'
import { embeddings } from '@/lib/chorum/embeddings'
import { invalidateCache } from './cache'
import { type DomainSignal, type StoredDomainSignal } from '@/lib/chorum/domainSignal'
import crypto from 'crypto'

export interface ExtractedLearning {
    type: 'pattern' | 'decision' | 'invariant' | 'antipattern' | 'golden_path'
    content: string
    context?: string
}

export interface AnalysisResult {
    patterns: ExtractedLearning[]
    decisions: ExtractedLearning[]
    invariants: ExtractedLearning[]
    antipatterns: ExtractedLearning[]
    goldenPaths: ExtractedLearning[]
}

type DomainSignalLike = DomainSignal | StoredDomainSignal | null | undefined

function formatDomainFocus(domainSignal: DomainSignalLike, focusDomains?: string[]): {
    primary: string
    secondary: string[]
} {
    const explicit = (focusDomains || []).filter(Boolean)
    if (explicit.length > 0) {
        return {
            primary: explicit[0],
            secondary: explicit.slice(1, 4)
        }
    }

    if (domainSignal?.primary && domainSignal.primary !== 'general') {
        const ranked = (domainSignal.domains || [])
            .map(d => d.domain)
            .filter(Boolean)
        return {
            primary: domainSignal.primary,
            secondary: ranked.filter(d => d !== domainSignal.primary).slice(0, 3)
        }
    }

    return { primary: 'general', secondary: [] }
}

function buildExtractionPrompt(options?: {
    domainSignal?: DomainSignalLike
    focusDomains?: string[]
}): string {
    const focus = formatDomainFocus(options?.domainSignal, options?.focusDomains)
    const domainLine = focus.secondary.length > 0
        ? `Domain focus: ${focus.primary} (secondary: ${focus.secondary.join(', ')})`
        : `Domain focus: ${focus.primary}`

    const domainGuidance = focus.primary === 'coding' || focus.primary === 'devops' || focus.primary === 'data'
        ? 'Interpret the categories in a software/technical context.'
        : `Interpret the categories in the context of ${focus.primary} work. Avoid coding or implementation details unless explicitly discussed.`

    return `You are analyzing a conversation turn to extract project-specific learnings.

${domainLine}
${domainGuidance}

ONLY extract items that are:
1. Specific to this project (not generic advice)
2. Worth remembering for future conversations
3. Explicitly stated or clearly implied

Categories to extract (domain-adaptive):
- PATTERNS: Recurring approaches or conventions in this domain
- DECISIONS: Explicit decisions with rationale (e.g., "We chose X because Y")
- INVARIANTS: Rules that must NEVER be violated
- ANTIPATTERNS: Things to avoid
- GOLDEN_PATHS: Step-by-step procedures that worked well

Return a JSON object with this structure:
{
  "patterns": [{ "content": "...", "context": "..." }],
  "decisions": [{ "content": "...", "context": "..." }],
  "invariants": [{ "content": "...", "context": "..." }],
  "antipatterns": [{ "content": "...", "context": "..." }],
  "golden_paths": [{ "content": "...", "context": "..." }]
}

If nothing worth extracting, return empty arrays for all categories.
Be selective - only extract truly valuable learnings.`
}

/**
 * Analyze a conversation turn and extract learnings
 */
export async function analyzeConversation(
    userMessage: string,
    assistantResponse: string,
    projectContext?: string,
    providerConfig?: FullProviderConfig,
    domainSignal?: DomainSignalLike,
    focusDomains?: string[]
): Promise<AnalysisResult> {
    const emptyResult: AnalysisResult = {
        patterns: [],
        decisions: [],
        invariants: [],
        antipatterns: [],
        goldenPaths: []
    }

    if (!providerConfig) {
        console.warn('[Analyzer] No provider config available, skipping analysis')
        return emptyResult
    }

    try {
        const analysisPrompt = `
## Conversation Turn

**User:** ${userMessage}

**Assistant:** ${assistantResponse}

${projectContext ? `\n## Project Context\n${projectContext}\n` : ''}

Analyze this conversation and extract any learnings.`

        const result = await callProvider(
            {
                ...providerConfig,
                model: providerConfig.model // Use the same model
            },
            [{ role: 'user', content: analysisPrompt }],
            buildExtractionPrompt({ domainSignal, focusDomains })
        )

        // Parse JSON response
        const jsonMatch = result.content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            console.warn('[Analyzer] No JSON found in response')
            return emptyResult
        }

        const parsed = JSON.parse(jsonMatch[0])

        return {
            patterns: (parsed.patterns || []).map((p: any) => ({
                type: 'pattern' as const,
                content: p.content,
                context: p.context
            })),
            decisions: (parsed.decisions || []).map((d: any) => ({
                type: 'decision' as const,
                content: d.content,
                context: d.context
            })),
            invariants: (parsed.invariants || []).map((i: any) => ({
                type: 'invariant' as const,
                content: i.content,
                context: i.context
            })),
            antipatterns: (parsed.antipatterns || []).map((a: any) => ({
                type: 'antipattern' as const,
                content: a.content,
                context: a.context
            })),
            goldenPaths: (parsed.golden_paths || []).map((g: any) => ({
                type: 'golden_path' as const,
                content: g.content,
                context: g.context
            }))
        }
    } catch (e) {
        console.error('[Analyzer] Failed to analyze conversation:', e)
        return emptyResult
    }
}

// --- Semantic Deduplication Helpers ---

interface ExistingItemForDedup {
    id: string
    content: string
    embedding: number[] | null
    usageCount: number | null
    createdAt: Date | null
}

/**
 * Generate MD5 hash of content for strict deduplication
 */
function hashContent(content: string): string {
    return crypto.createHash('md5').update(content.trim().toLowerCase()).digest('hex')
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        magA += a[i] * a[i]
        magB += b[i] * b[i]
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1)
}

/**
 * Find an existing item that is semantically near-duplicate of the new embedding.
 * Returns the closest match above threshold, or null if no near-duplicate exists.
 */
function findNearDuplicate(
    existingItems: ExistingItemForDedup[],
    newEmbedding: number[],
    threshold: number
): ExistingItemForDedup | null {
    let bestMatch: ExistingItemForDedup | null = null
    let bestSimilarity = 0

    for (const item of existingItems) {
        if (!item.embedding || item.embedding.length === 0) continue

        const similarity = cosineSimilarity(
            newEmbedding,
            item.embedding as number[]
        )

        if (similarity >= threshold && similarity > bestSimilarity) {
            bestMatch = item
            bestSimilarity = similarity
        }
    }

    return bestMatch
}

/**
 * Merge a new learning into an existing near-duplicate.
 * Updates the existing item with newer wording and embedding.
 */
async function mergeWithExisting(
    existing: ExistingItemForDedup,
    newLearning: ExtractedLearning,
    projectId: string,
    newEmbedding: number[]
): Promise<void> {
    // Update existing item with newer wording and embedding
    await db.update(projectLearningPaths)
        .set({
            content: newLearning.content,
            context: newLearning.context || undefined,
            embedding: newEmbedding,
            usageCount: sql`${projectLearningPaths.usageCount} + 1`
        })
        .where(eq(projectLearningPaths.id, existing.id))

    // Log the merge for observability
    console.log(
        `[Chorum:Dedup] Merged near-duplicate into ${existing.id.slice(0, 8)}... | ` +
        `Old: "${existing.content.slice(0, 40)}..." → ` +
        `New: "${newLearning.content.slice(0, 40)}..."`
    )
}

/**
 * Store extracted learnings, deduplicating against existing entries
 */

export async function storeLearnings(
    projectId: string,
    learnings: ExtractedLearning[],
    sourceMessageId?: string,
    userId?: string,
    source: string = 'web-ui',
    needsReview: boolean = false
): Promise<{ stored: number; duplicates: number; merged: number }> {
    let stored = 0
    let duplicates = 0
    let merged = 0

    // If review is needed, route to pending_learnings table
    if (needsReview && userId) {
        for (const learning of learnings) {
            // Check for exact duplicate in pending
            const existingPending = await db.select()
                .from(pendingLearnings)
                .where(
                    and(
                        eq(pendingLearnings.projectId, projectId),
                        eq(pendingLearnings.type, learning.type),
                        eq(pendingLearnings.status, 'pending')
                    )
                )
                .then(rows => rows.find(r => hashContent(r.content) === hashContent(learning.content)))

            if (existingPending) {
                duplicates++
                continue
            }

            // Insert into pending
            await db.insert(pendingLearnings).values({
                projectId,
                userId,
                type: learning.type,
                content: learning.content,
                context: learning.context,
                source,
                status: 'pending',
                sourceMetadata: sourceMessageId ? { sourceMessageId } : undefined
            })
            stored++
        }
        return { stored, duplicates, merged }
    }

    // Original logic for active learnings
    for (const learning of learnings) {
        const contentHash = hashContent(learning.content)

        // Generate embedding first (needed for strict semantic check)
        let embedding: number[] | null = null
        try {
            // Context helps clarify the embedding space
            const textToEmbed = learning.context
                ? `${learning.content} ${learning.context}`
                : learning.content

            embedding = await embeddings.embed(textToEmbed, userId)
        } catch (e) {
            console.error('[Analyzer] Failed to generate embedding:', e)
            // Continue without embedding (will skip semantic dedup)
        }

        // 1. Exact Duplicate Check (MD5)
        const existingExact = await db.select()
            .from(projectLearningPaths)
            .where(
                and(
                    eq(projectLearningPaths.projectId, projectId),
                    eq(projectLearningPaths.type, learning.type)
                )
            )
            .then(rows => rows.find(r => hashContent(r.content) === contentHash))

        if (existingExact) {
            duplicates++
            continue
        }

        // 2. Semantic Duplicate Check (Cosine Similarity)
        if (embedding && embedding.length > 0) {
            const existingItems = await db.select({
                id: projectLearningPaths.id,
                content: projectLearningPaths.content,
                embedding: projectLearningPaths.embedding,
                usageCount: projectLearningPaths.usageCount,
                createdAt: projectLearningPaths.createdAt
            })
                .from(projectLearningPaths)
                .where(
                    and(
                        eq(projectLearningPaths.projectId, projectId),
                        eq(projectLearningPaths.type, learning.type)
                    )
                )

            const nearDuplicate = findNearDuplicate(existingItems, embedding, 0.85)

            if (nearDuplicate) {
                await mergeWithExisting(nearDuplicate, learning, projectId, embedding)
                merged++
                continue
            }
        }

        // Insert new learning
        await db.insert(projectLearningPaths).values({
            projectId,
            type: learning.type,
            content: learning.content,
            context: learning.context,
            metadata: sourceMessageId ? { source_message_id: sourceMessageId } : undefined,
            embedding,
            source // Track source
        })

        stored++
    }

    if (stored > 0 || merged > 0) {
        invalidateCache(projectId).catch(err =>
            console.error('[Analyzer] Failed to invalidate cache:', err)
        )
    }

    return { stored, duplicates, merged }
}

/**
 * Full analysis and storage pipeline
 */
export async function extractAndStoreLearnings(
    projectId: string,
    userMessage: string,
    assistantResponse: string,
    providerConfig: FullProviderConfig,
    projectContext?: string,
    sourceMessageId?: string,
    userId?: string,
    domainSignal?: DomainSignalLike,
    focusDomains?: string[],
    source: string = 'web-ui'
): Promise<{ stored: number; duplicates: number; merged: number }> {
    const result = await analyzeConversation(
        userMessage,
        assistantResponse,
        projectContext,
        providerConfig,
        domainSignal,
        focusDomains
    )

    // Flatten all learnings
    const allLearnings: ExtractedLearning[] = [
        ...result.patterns,
        ...result.decisions,
        ...result.invariants,
        ...result.antipatterns,
        ...result.goldenPaths
    ]

    if (allLearnings.length === 0) {
        return { stored: 0, duplicates: 0, merged: 0 }
    }

    // Determine if review is needed
    // Imports (starting with "Import:") require review
    const needsReview = source.startsWith('Import:')

    return await storeLearnings(projectId, allLearnings, sourceMessageId, userId, source, needsReview)
}
