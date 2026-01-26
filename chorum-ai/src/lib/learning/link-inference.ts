import { db } from '@/lib/db'
import { learningCooccurrence, projectLearningPaths, learningLinks } from '@/lib/db/schema'
import { getCohorts } from './cooccurrence'
import { createLink, type LinkType } from './links'
import { callProvider } from '@/lib/providers'
import { eq, and, inArray } from 'drizzle-orm'
import type { LearningItem } from './types'

// Types
type LinkSuggestion = {
    index: number
    a_id: string
    b_id: string
    type: LinkType
    direction: 'a_to_b' | 'b_to_a' | 'bidirectional'
    confidence: number
}

// Prompt for batch inference
const BATCH_LINK_PROMPT = `
Analyze relationships between knowledge items that frequently appear together.

For each pair, determine if there's a LOGICAL relationship (not just topic similarity):
- supports: A provides evidence/reasoning for B (or vice versa)
- contradicts: A and B give conflicting guidance (IMPORTANT: flag these)
- supersedes: A replaces/updates B (or vice versa)
- protects: A is an invariant that guards B (or vice versa)
- none: No logical relationship, just topically related

Check for directional relationships.
Be conservative. "none" is the right answer for most pairs.

Response Format: JSON Array of objects:
[{ "index": 0, "type": "supports", "direction": "a_to_b", "confidence": 0.8 }, ...]
Only return objects for relationships with >0.6 confidence.
`

/**
 * inferLinksForProject
 * Background job to infer links from co-occurrence data.
 */
export async function inferLinksForProject(
    projectId: string,
    providerConfig: any // Provider creds to use for inference
): Promise<{ processed: number; created: number }> {

    // 1. Get high-signal co-occurrences (e.g. >= 3 co-occurrences)
    const cohorts = await getCohorts(projectId, 3)
    if (cohorts.length === 0) return { processed: 0, created: 0 }

    // 2. Fetch Item Content
    const itemIds = [...new Set(cohorts.flatMap(c => [c.itemA, c.itemB]))]
    if (itemIds.length === 0) return { processed: 0, created: 0 }

    const items = await db.select()
        .from(projectLearningPaths)
        .where(and(
            eq(projectLearningPaths.projectId, projectId),
            inArray(projectLearningPaths.id, itemIds)
        ))

    const itemMap = new Map(items.map(i => [i.id, i]))

    // 3. Prepare Batch for LLM
    // We process in chunks of 20 pairs to avoid context limits
    const BATCH_SIZE = 20
    let linksCreated = 0

    for (let i = 0; i < cohorts.length; i += BATCH_SIZE) {
        const batch = cohorts.slice(i, i + BATCH_SIZE)
        const pairs = batch.map((c, idx) => {
            const itemA = itemMap.get(c.itemA)
            const itemB = itemMap.get(c.itemB)
            if (!itemA || !itemB) return null

            return {
                idx,
                a: itemA,
                b: itemB,
                stats: c
            }
        }).filter(Boolean) as { idx: number; a: typeof projectLearningPaths.$inferSelect; b: typeof projectLearningPaths.$inferSelect; stats: typeof learningCooccurrence.$inferSelect }[]

        if (pairs.length === 0) continue

        const promptContent = `PAIRS TO ANALYZE:\n` + pairs.map((p, idx) => `
[${idx}] Item A (${p.a.id}): "${p.a.content}"
    Item B (${p.b.id}): "${p.b.content}"
    Co-occurred: ${p.stats.count} times (${p.stats.positiveCount} positive)
`).join('\n')

        try {
            // Call LLM
            const result = await callProvider(
                {
                    provider: providerConfig.provider,
                    apiKey: providerConfig.apiKey,
                    model: providerConfig.model,
                    baseUrl: providerConfig.baseUrl,
                    isLocal: providerConfig.isLocal
                },
                [
                    { role: 'user', content: promptContent }
                ],
                BATCH_LINK_PROMPT
            )

            // Parse Response
            const content = result.content.replace(/```json/g, '').replace(/```/g, '').trim()
            // Locate start and end of JSON array
            const startIdx = content.indexOf('[')
            const endIdx = content.lastIndexOf(']')
            if (startIdx === -1 || endIdx === -1) continue

            const jsonStr = content.substring(startIdx, endIdx + 1)
            const suggestions = JSON.parse(jsonStr) as LinkSuggestion[]

            // Create Links
            for (const s of suggestions) {
                if (s.confidence < 0.7) continue
                const pair = pairs[s.index]
                if (!pair) continue

                // Determine direction
                let fromId = pair.a.id
                let toId = pair.b.id

                if (s.direction === 'b_to_a') {
                    fromId = pair.b.id
                    toId = pair.a.id
                }

                await createLink({
                    projectId,
                    fromId,
                    toId,
                    linkType: s.type,
                    strength: s.confidence,
                    source: 'inferred'
                })
                linksCreated++
            }
        } catch (e) {
            console.warn(`[Learning] Batch inference failed for chunk ${i}:`, e)
        }
    }

    return { processed: cohorts.length, created: linksCreated }
}
