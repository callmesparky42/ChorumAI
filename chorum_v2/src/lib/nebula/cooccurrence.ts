// src/lib/nebula/cooccurrence.ts
import { db } from '@/db'
import { cooccurrence } from '@/db/schema'
import { eq, or, sql } from 'drizzle-orm'
import type { CooccurrenceEntry } from './types'

/**
 * For every ordered pair (a, b) where a < b (UUID lexicographic order):
 * upsert the cooccurrence row — increment count, update last_seen.
 * UUID < comparison is deterministic because PostgreSQL UUIDs are strings.
 */
export async function recordCooccurrence(ids: string[]): Promise<void> {
  if (ids.length < 2) return

  const pairs: Array<{ learningA: string; learningB: string }> = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const left = ids[i]
      const right = ids[j]
      if (!left || !right) continue
      const [a, b] = left < right ? [left, right] : [right, left]
      pairs.push({ learningA: a, learningB: b })
    }
  }

  for (const pair of pairs) {
    await db
      .insert(cooccurrence)
      .values({ learningA: pair.learningA, learningB: pair.learningB, count: 1, lastSeen: new Date() })
      .onConflictDoUpdate({
        target: [cooccurrence.learningA, cooccurrence.learningB],
        set: {
          count:   sql`${cooccurrence.count} + 1`,
          lastSeen: new Date(),
        },
      })
  }
}

/**
 * Returns learnings that co-occur most frequently with the given learningId.
 * Returns the OTHER member of each pair, not the given ID.
 */
export async function getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]> {
  const rows = await db
    .select()
    .from(cooccurrence)
    .where(
      or(
        eq(cooccurrence.learningA, learningId),
        eq(cooccurrence.learningB, learningId),
      )
    )
    .orderBy(sql`${cooccurrence.count} DESC`)
    .limit(limit)

  return rows.map((row) => ({
    learningId:    row.learningA === learningId ? row.learningB : row.learningA,
    count:         row.count,
    positiveCount: row.positiveCount,
    negativeCount: row.negativeCount,
    lastSeen:      row.lastSeen,
  }))
}
