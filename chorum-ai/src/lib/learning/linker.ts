import { db } from '@/lib/db'
import { learningLinks, learningCooccurrence } from '@/lib/db/schema'
import { sql, desc, gt, and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

interface LinkResult {
    linksCreated: number
    linksUpdated: number
}

/**
 * Backfills learning links from co-occurrence data.
 * This bootstraps the Zettelkasten graph using observed usage patterns.
 * 
 * Logic:
 * 1. Find pairs that co-occur frequently (> 3 times).
 * 2. Create a 'supports' link between them if none exists.
 * 3. Set strength based on positive feedback ratio.
 */
export async function backfillLinksFromCooccurrence(projectId: string): Promise<LinkResult> {
    console.log(`[Linker] Starting link backfill for project ${projectId}`)

    // 1. Fetch significant co-occurrence pairs
    const pairs = await db.select()
        .from(learningCooccurrence)
        .where(and(
            eq(learningCooccurrence.projectId, projectId),
            gt(learningCooccurrence.count, 3) // Only strong signals
        ))
        .orderBy(desc(learningCooccurrence.count))

    let created = 0
    let updated = 0

    for (const pair of pairs) {
        // Calculate strength: Base 0.1 + (Positive / Total) * 0.9
        // A pair that always gets positive feedback -> strength 1.0 (almost)
        const total = pair.count || 1
        const positive = pair.positiveCount || 0
        const ratio = positive / total
        const strength = 0.1 + (ratio * 0.8) // Max 0.9, min 0.1

        // Check if link exists
        const existing = await db.query.learningLinks.findFirst({
            where: (links, { and, eq, or }) => and(
                eq(links.projectId, projectId),
                or(
                    and(eq(links.fromId, pair.itemA), eq(links.toId, pair.itemB)),
                    and(eq(links.fromId, pair.itemB), eq(links.toId, pair.itemA))
                )
            )
        })

        if (existing) {
            // Update strength if calculated is higher (don't downgrade manual links)
            if (strength > Number(existing.strength)) {
                await db.update(learningLinks)
                    .set({ strength: strength.toString() }) // Numeric in schema usually, but handled as string in some contexts? Schema says decimal.
                    .where(eq(learningLinks.id, existing.id))
                updated++
            }
        } else {
            // Create new bidirectional link (represented as one link record usually, or directed?)
            // Schema has from/to. We'll create one 'supports' link.
            // Direction implies B follows A? Co-occurrence is undirected.
            // Arbitrarily A -> B for 'supports' since they go together.

            await db.insert(learningLinks).values({
                id: uuidv4(),
                projectId,
                fromId: pair.itemA,
                toId: pair.itemB,
                linkType: 'supports',
                strength: strength.toString(), // Store as string decimal
                rationale: `Observed co-occurrence count: ${pair.count}`
            })
            created++
        }
    }

    console.log(`[Linker] Backfill complete. Created ${created}, Updated ${updated} links.`)
    return { linksCreated: created, linksUpdated: updated }
}
