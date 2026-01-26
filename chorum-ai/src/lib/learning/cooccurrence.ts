import { db } from '@/lib/db'
import { learningCooccurrence } from '@/lib/db/schema'
import { sql, and, eq } from 'drizzle-orm'

/**
 * upsertCooccurrence
 * Tracks that two items were retrieved together.
 * Increment count. If feedback was positive, increment positiveCount.
 */
export async function upsertCooccurrence(input: {
    projectId: string
    itemA: string
    itemB: string
    isPositive: boolean
}) {
    // 1. Canonical ordering (smaller UUID first)
    const [a, b] = input.itemA < input.itemB
        ? [input.itemA, input.itemB]
        : [input.itemB, input.itemA]

    if (a === b) return // Don't track self-cooccurrence

    // 2. Upsert
    await db.insert(learningCooccurrence)
        .values({
            projectId: input.projectId,
            itemA: a,
            itemB: b,
            count: 1,
            positiveCount: input.isPositive ? 1 : 0,
            lastSeen: new Date()
        })
        .onConflictDoUpdate({
            target: [learningCooccurrence.itemA, learningCooccurrence.itemB],
            set: {
                count: sql`${learningCooccurrence.count} + 1`,
                positiveCount: input.isPositive
                    ? sql`${learningCooccurrence.positiveCount} + 1`
                    : learningCooccurrence.positiveCount,
                lastSeen: new Date()
            }
        })
}

/**
 * getCohorts
 * Get high-signal pairs for link inference.
 * returns pairs that have appeared together minCount times.
 */
export async function getCohorts(projectId: string, minCount: number = 3) {
    return db.query.learningCooccurrence.findMany({
        where: (t, { and, eq, gte }) => and(
            eq(t.projectId, projectId),
            gte(t.count, minCount)
        ),
        limit: 50,
        orderBy: (t, { desc }) => [desc(t.count)]
    })
}
