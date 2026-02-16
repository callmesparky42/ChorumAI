import { db } from '@/lib/db'
import { projectLearningPaths } from '@/lib/db/schema'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { embeddings } from '@/lib/chorum/embeddings' // Reusing the same embedding logic

interface LearningItem {
    id: string
    type: string
    content: string
    embedding: number[] | null
    usageCount: number
    lastUsedAt: Date | null
    createdAt: Date
}

interface CompactionResult {
    clustersFound: number
    itemsMerged: number
    prototypesCreated: string[]
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
 * Compacts learnings for a project by merging semantically similar items.
 * 
 * Algorithm:
 * 1. Fetch all items for the project.
 * 2. Group by type (patterns with patterns, etc).
 * 3. Within each group, greedy clustering:
 *    - Pick an unvisited item as seed.
 *    - Find all other unvisited items with similarity > 0.85.
 *    - Form a cluster.
 * 4. For each cluster > 1 item:
 *    - Select prototype (highest usage, thence most recent).
 *    - Merge others into prototype:
 *      - Sum usage counts.
 *      - Update lastUsedAt to max.
 *      - Delete merged items.
 */
export async function compactLearnings(projectId: string): Promise<CompactionResult> {
    console.log(`[Compactor] Starting compaction for project ${projectId}`)

    // 1. Fetch all learnings
    const allItems = await db.select()
        .from(projectLearningPaths)
        .where(eq(projectLearningPaths.projectId, projectId))

    if (allItems.length === 0) {
        return { clustersFound: 0, itemsMerged: 0, prototypesCreated: [] }
    }

    // 2. Group by type
    const byType: Record<string, LearningItem[]> = {}
    for (const item of allItems) {
        if (!byType[item.type]) byType[item.type] = []
        // Cast raw DB result to our interface (embedding is unknown/any in drizzle result sometimes)
        byType[item.type].push(item as unknown as LearningItem)
    }

    let totalClusters = 0
    let totalMerged = 0
    const prototypes: string[] = []

    // 3. Process each type
    for (const type of Object.keys(byType)) {
        // Skip anchors logic - anchors are identity facts, usually distinct
        // But maybe duplicate anchors exist? "Chorum" vs "ChorumAI" might want separate entries or merge?
        // Let's compact anchors too if they are strictly redundant.

        const items = byType[type]
        const visited = new Set<string>()

        for (const item of items) {
            if (visited.has(item.id)) continue
            visited.add(item.id)

            if (!item.embedding) continue // Skip items without embeddings

            // Find cluster
            const cluster: LearningItem[] = [item]

            for (const candidate of items) {
                if (visited.has(candidate.id)) continue
                if (!candidate.embedding) continue

                const sim = cosineSimilarity(item.embedding, candidate.embedding)
                if (sim >= 0.85) { // High threshold for safe auto-merge
                    cluster.push(candidate)
                    visited.add(candidate.id)
                }
            }

            if (cluster.length > 1) {
                // 4. Merge Cluster
                totalClusters++

                // Select prototype: Prefer high usage, then recency
                cluster.sort((a, b) => {
                    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
                    return b.createdAt.getTime() - a.createdAt.getTime()
                })

                const prototype = cluster[0]
                const toMerge = cluster.slice(1)

                // Calculate aggregated stats
                const totalUsage = cluster.reduce((sum, i) => sum + (i.usageCount || 0), 0)
                const maxLastUsed = cluster.reduce((max, i) => {
                    const time = i.lastUsedAt ? i.lastUsedAt.getTime() : 0
                    return time > max ? time : max
                }, 0)

                // Update prototype
                await db.update(projectLearningPaths)
                    .set({
                        usageCount: totalUsage,
                        lastUsedAt: maxLastUsed > 0 ? new Date(maxLastUsed) : null
                    })
                    .where(eq(projectLearningPaths.id, prototype.id))

                // Delete merged items
                const idsToDelete = toMerge.map(i => i.id)
                await db.delete(projectLearningPaths)
                    .where(inArray(projectLearningPaths.id, idsToDelete))

                totalMerged += toMerge.length
                prototypes.push(prototype.content)

                console.log(`[Compactor] Merged ${toMerge.length} items into "${prototype.content.slice(0, 30)}..."`)
            }
        }
    }

    return {
        clustersFound: totalClusters,
        itemsMerged: totalMerged,
        prototypesCreated: prototypes
    }
}
