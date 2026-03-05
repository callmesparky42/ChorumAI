// src/lib/nebula/dedup.ts
import { db } from '@/db'
import { learnings, embeddings1536, embeddings384 } from '@/db/schema'
import { sql, eq, and } from 'drizzle-orm'
import type { LearningType } from './types'
import type { Learning } from './types'

export const DEDUP_THRESHOLD = 0.85  // cosine similarity (1 = identical)

export interface DedupResult {
  isDuplicate: boolean
  existingId: string | null
}

/**
 * Check if a near-duplicate learning already exists for this user + type.
 * Uses pgvector cosine distance operator (<=>).
 * Returns the ID of the nearest match if similarity >= DEDUP_THRESHOLD.
 */
export async function findNearDuplicate(
  userId: string,
  type: LearningType,
  embedding: number[],
  dims: 384 | 1536,
): Promise<DedupResult> {
  const embStr = `[${embedding.join(',')}]`
  const dimStr = String(dims)
  const tbl = dims === 1536 ? sql`embeddings_1536` : sql`embeddings_384`
  const castVec = sql.raw(`::vector(${dimStr})`)

  // Raw SQL: join embedding table → learnings, filter user+type, order by cosine distance
  const rows = await db.execute<{ learning_id: string; similarity: number }>(sql`
    SELECT e.learning_id,
           1 - (e.embedding <=> ${embStr}${castVec}) AS similarity
    FROM   ${tbl} e
    JOIN   learnings l ON l.id = e.learning_id
    WHERE  l.user_id = ${userId}::uuid
      AND  l.type    = ${type}
    ORDER BY e.embedding <=> ${embStr}${castVec}
    LIMIT  1
  `)

  const row = rows[0]
  if (row && row.similarity >= DEDUP_THRESHOLD) {
    return { isDuplicate: true, existingId: row.learning_id }
  }
  return { isDuplicate: false, existingId: null }
}

/**
 * Update an existing learning's content (newer wording wins).
 * Records lineage: refinedFrom = incomingId marks that this wording arrived from a near-duplicate.
 * Also bumps updatedAt. Does NOT touch confidenceBase or confidence.
 */
export async function mergeWithExisting(
  existingId: string,
  newContent: string,
  incomingId?: string,   // ID of the new (soon-to-be-discarded) learning being merged in
): Promise<void> {
  await db
    .update(learnings)
    .set({
      content: newContent,
      updatedAt: new Date(),
      ...(incomingId ? { refinedFrom: incomingId } : {}),
    })
    .where(eq(learnings.id, existingId))
}