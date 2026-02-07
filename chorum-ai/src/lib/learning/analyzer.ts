/**
 * Pattern Analyzer
 * 
 * Extracts patterns, decisions, and invariants from conversations
 * using an LLM call. This is the "Write Path" for semantic memory.
 */

import { db } from '@/lib/db'
import { projectLearningPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { callProvider, type FullProviderConfig } from '@/lib/providers'
import { embeddings } from '@/lib/chorum/embeddings'
import crypto from 'crypto'

export interface ExtractedLearning {
    type: 'pattern' | 'decision' | 'invariant' | 'antipattern'
    content: string
    context?: string
}

export interface AnalysisResult {
    patterns: ExtractedLearning[]
    decisions: ExtractedLearning[]
    invariants: ExtractedLearning[]
    antipatterns: ExtractedLearning[]
}

const EXTRACTION_PROMPT = `You are analyzing a conversation turn to extract project-specific learnings.

ONLY extract items that are:
1. Specific to this project (not generic programming advice)
2. Worth remembering for future conversations
3. Explicitly stated or clearly implied

Categories to extract:
- PATTERNS: Coding conventions, architectural choices, recurring approaches
- DECISIONS: Explicit technical decisions with rationale (e.g., "We chose X because Y")
- INVARIANTS: Rules that must NEVER be violated (e.g., "Always validate input before...")
- ANTIPATTERNS: Things to avoid (e.g., "Don't use X because...")

Return a JSON object with this structure:
{
  "patterns": [{ "content": "...", "context": "..." }],
  "decisions": [{ "content": "...", "context": "..." }],
  "invariants": [{ "content": "...", "context": "..." }],
  "antipatterns": [{ "content": "...", "context": "..." }]
}

If nothing worth extracting, return empty arrays for all categories.
Be selective - only extract truly valuable learnings.`

/**
 * Analyze a conversation turn and extract learnings
 */
export async function analyzeConversation(
    userMessage: string,
    assistantResponse: string,
    projectContext?: string,
    providerConfig?: FullProviderConfig
): Promise<AnalysisResult> {
    const emptyResult: AnalysisResult = {
        patterns: [],
        decisions: [],
        invariants: [],
        antipatterns: []
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
            EXTRACTION_PROMPT
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
            }))
        }
    } catch (e) {
        console.error('[Analyzer] Failed to analyze conversation:', e)
        return emptyResult
    }
}

/**
 * Generate a content hash for deduplication
 */
function hashContent(content: string): string {
    return crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex')
}

/**
 * Store extracted learnings, deduplicating against existing entries
 */
import { invalidateCache } from './cache'

export async function storeLearnings(
    projectId: string,
    learnings: ExtractedLearning[],
    sourceMessageId?: string,
    userId?: string
): Promise<{ stored: number; duplicates: number }> {
    let stored = 0
    let duplicates = 0

    for (const learning of learnings) {
        const contentHash = hashContent(learning.content)

        // Check for existing entry with same content
        const existing = await db.select()
            .from(projectLearningPaths)
            .where(
                and(
                    eq(projectLearningPaths.projectId, projectId),
                    eq(projectLearningPaths.type, learning.type)
                )
            )
            .then(rows => rows.find(r => hashContent(r.content) === contentHash))

        if (existing) {
            duplicates++
            continue
        }

        // Generate embedding
        let embedding: number[] | null = null
        try {
            // Context helps clarify the embedding space
            const textToEmbed = learning.context
                ? `${learning.content} ${learning.context}`
                : learning.content

            embedding = await embeddings.embed(textToEmbed, userId)
        } catch (e) {
            console.error('[Analyzer] Failed to generate embedding:', e)
            // We continue without embedding, but log it. 
            // The system will fallback to recency/type scoring.
        }

        // Insert new learning
        await db.insert(projectLearningPaths).values({
            projectId,
            type: learning.type,
            content: learning.content,
            context: learning.context,
            metadata: sourceMessageId ? { source_message_id: sourceMessageId } : undefined,
            embedding
        })

        stored++
    }

    if (stored > 0) {
        invalidateCache(projectId).catch(err =>
            console.error('[Analyzer] Failed to invalidate cache:', err)
        )
    }

    return { stored, duplicates }
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
    userId?: string
): Promise<{ stored: number; duplicates: number }> {
    const result = await analyzeConversation(
        userMessage,
        assistantResponse,
        projectContext,
        providerConfig
    )

    // Flatten all learnings
    const allLearnings: ExtractedLearning[] = [
        ...result.patterns,
        ...result.decisions,
        ...result.invariants,
        ...result.antipatterns
    ]

    if (allLearnings.length === 0) {
        return { stored: 0, duplicates: 0 }
    }

    return await storeLearnings(projectId, allLearnings, sourceMessageId, userId)
}
