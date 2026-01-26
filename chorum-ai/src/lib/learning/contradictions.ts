import { db } from '@/lib/db'
import { learningLinks, projectLearningPaths } from '@/lib/db/schema'
import { eq, and, gte, or, inArray } from 'drizzle-orm'
import { LearningItem } from './types'

export interface Contradiction {
    id: string
    itemA: LearningItem
    itemB: LearningItem
    strength: number // 0-1
    detectedAt: Date
}

/**
 * checkForContradictions
 * Finds high-confidence 'contradicts' links for a project.
 */
export async function checkForContradictions(
    projectId: string
): Promise<Contradiction[]> {
    // 1. Find contradiction links
    const contradictions = await db.select()
        .from(learningLinks)
        .where(and(
            eq(learningLinks.projectId, projectId),
            eq(learningLinks.linkType, 'contradicts'),
            gte(learningLinks.strength, '0.6') // Only confident contradictions
        ))

    if (contradictions.length === 0) return []

    // 2. Fetch the conflicting items
    const itemIds = [...new Set(contradictions.flatMap(c => [c.fromId, c.toId]))]

    // Helper to get items with types
    const itemsRaw = await db.select()
        .from(projectLearningPaths)
        .where(and(
            eq(projectLearningPaths.projectId, projectId),
            inArray(projectLearningPaths.id, itemIds)
        ))

    const items: LearningItem[] = itemsRaw.map(item => ({
        id: item.id,
        projectId: item.projectId,
        type: item.type as LearningItem['type'],
        content: item.content,
        context: item.context,
        metadata: item.metadata as LearningItem['metadata'],
        embedding: item.embedding,
        domains: item.domains as string[] | null,
        usageCount: item.usageCount || 0,
        lastUsedAt: item.lastUsedAt,
        createdAt: item.createdAt
    }))

    const itemMap = new Map(items.map(i => [i.id, i]))
    const results: Contradiction[] = []

    for (const link of contradictions) {
        const itemA = itemMap.get(link.fromId)
        const itemB = itemMap.get(link.toId)

        if (itemA && itemB) {
            results.push({
                id: link.id,
                itemA,
                itemB,
                strength: Number(link.strength),
                detectedAt: link.createdAt || new Date()
            })
        }
    }

    return results
}

/**
 * formatContradictionWarning
 * Surfaces contradiction in a user-friendly way.
 */
export function formatContradictionWarning(contradiction: Contradiction): string {
    return `⚠️ CONFLICTING GUIDANCE DETECTED (Confidence: ${Math.round(contradiction.strength * 100)}%):
  - "${contradiction.itemA.content}"
  - "${contradiction.itemB.content}"
  Consider resolving this conflict or marking one as superseded.`
}
