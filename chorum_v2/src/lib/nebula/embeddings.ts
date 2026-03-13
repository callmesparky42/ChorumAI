// src/lib/nebula/embeddings.ts
import { db } from '@/db'
import { learnings, learningScopes, embeddings1536, embeddings384 } from '@/db/schema'
import { eq, and, notInArray, sql, inArray } from 'drizzle-orm'
import type { Learning, ScoredLearning, ScopeFilter, LearningType, ExtractionMethod } from './types'
import { NebulaError } from './errors'

function rowToLearning(row: typeof learnings.$inferSelect): Learning {
  return {
    id: row.id,
    userId: row.userId,
    teamId: row.teamId ?? null,
    content: row.content,
    type: row.type as LearningType,
    confidenceBase: row.confidenceBase,
    confidence: row.confidence,
    extractionMethod: row.extractionMethod as ExtractionMethod,
    sourceConversationId: row.sourceConversationId ?? null,
    refinedFrom: row.refinedFrom ?? null,
    pinnedAt: row.pinnedAt ?? null,
    mutedAt: row.mutedAt ?? null,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt ?? null,
    sourceApp: row.sourceApp ?? null,
    promotedAt: row.promotedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// setEmbedding — upsert embedding row
// ---------------------------------------------------------------------------

export async function setEmbedding(
  learningId: string,
  embedding: number[],
  dims: 384 | 1536,
  model: string,
): Promise<void> {
  const embStr = `[${embedding.join(',')}]`

  if (dims === 1536) {
    await db
      .insert(embeddings1536)
      .values({ learningId, embedding: embedding, modelName: model })
      .onConflictDoUpdate({
        target: embeddings1536.learningId,
        set: { embedding: embedding, modelName: model },
      })
  } else {
    await db
      .insert(embeddings384)
      .values({ learningId, embedding: embedding, modelName: model })
      .onConflictDoUpdate({
        target: embeddings384.learningId,
        set: { embedding: embedding, modelName: model },
      })
  }
}

// ---------------------------------------------------------------------------
// hasEmbedding
// ---------------------------------------------------------------------------

export async function hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean> {
  const table = dims === 1536 ? embeddings1536 : embeddings384
  const [row] = await db
    .select({ learningId: table.learningId })
    .from(table)
    .where(eq(table.learningId, learningId))
    .limit(1)
  return !!row
}

// ---------------------------------------------------------------------------
// getLearningsWithoutEmbedding — for backfill jobs
// ---------------------------------------------------------------------------

export async function getLearningsWithoutEmbedding(
  dims: 384 | 1536,
  limit: number,
): Promise<Learning[]> {
  const table = dims === 1536 ? embeddings1536 : embeddings384
  const subCol = table.learningId

  // SELECT * FROM learnings WHERE id NOT IN (SELECT learning_id FROM embeddings_NNN) LIMIT N
  const embeddedIds = db.select({ id: subCol }).from(table)

  const rows = await db
    .select()
    .from(learnings)
    .where(notInArray(learnings.id, embeddedIds))
    .limit(limit)

  return rows.map(rowToLearning)
}

// ---------------------------------------------------------------------------
// searchByEmbedding — primary semantic search
// ---------------------------------------------------------------------------

export async function searchByEmbedding(
  userId: string,
  embedding: number[],
  dims: 384 | 1536,
  scopeFilter: ScopeFilter,
  limit: number,
  allowCrossLens: boolean = false,
): Promise<ScoredLearning[]> {
  // Cross-lens guard: if not allowing cross-lens, include must be specified
  if (!allowCrossLens && scopeFilter.include.length === 0) {
    throw new NebulaError(
      'CROSS_LENS_DENIED',
      'scopeFilter.include must be non-empty when allowCrossLens is false',
    )
  }

  const embStr = `[${embedding.join(',')}]`
  const dimStr = String(dims)
  const tbl = dims === 1536 ? sql`embeddings_1536` : sql`embeddings_384`
  const cast = sql.raw(`::vector(${dimStr})`)

  // Build scope filter clause
  // When allowCrossLens = false: learnings must have at least one scope in include list
  // When allowCrossLens = true: no hard scope restriction; all results allowed
  const scopeClause = (scopeFilter.include.length > 0 && !allowCrossLens)
    ? sql`AND l.id IN (
        SELECT ls.learning_id FROM learning_scopes ls
        WHERE ls.scope = ANY(${scopeFilter.include})
      )`
    : sql``

  // Exclude scopes
  const excludeClause = scopeFilter.exclude.length > 0
    ? sql`AND l.id NOT IN (
        SELECT ls.learning_id FROM learning_scopes ls
        WHERE ls.scope = ANY(${scopeFilter.exclude})
      )`
    : sql``

  const rows = await db.execute<{
    id: string; user_id: string; team_id: string | null; content: string; type: string;
    confidence_base: number; confidence: number; extraction_method: string;
    source_conversation_id: string | null; refined_from: string | null;
    pinned_at: Date | null; muted_at: Date | null;
    usage_count: number; last_used_at: Date | null; source_app: string | null; promoted_at: Date | null;
    created_at: Date; updated_at: Date;
    semantic_score: number; is_cross_lens: boolean;
  }>(sql`
    SELECT l.*,
           1 - (e.embedding <=> ${embStr}${cast})         AS semantic_score,
           NOT EXISTS (
             SELECT 1 FROM learning_scopes ls2
             WHERE  ls2.learning_id = l.id
               AND  ls2.scope = ANY(${scopeFilter.include.length > 0 ? scopeFilter.include : ['__none__']})
           )                                               AS is_cross_lens
    FROM   ${tbl} e
    JOIN   learnings l ON l.id = e.learning_id
    WHERE  l.user_id = ${userId}
      AND  l.muted_at IS NULL
      ${scopeClause}
      ${excludeClause}
    ORDER BY e.embedding <=> ${embStr}${cast}
    LIMIT  ${limit}
  `)

  return rows.map((row) => {
    // Scope match score: 1.0 if in include list, 0 otherwise
    // (full scoring with boost is Layer 1's responsibility)
    const scopeMatchScore = row.is_cross_lens ? 0 : 1
    const score = row.semantic_score * 0.7 + scopeMatchScore * 0.3

    return {
      id: row.id,
      userId: row.user_id,
      teamId: row.team_id,
      content: row.content,
      type: row.type as LearningType,
      confidenceBase: row.confidence_base,
      confidence: row.confidence,
      extractionMethod: row.extraction_method as ExtractionMethod,
      sourceConversationId: row.source_conversation_id,
      refinedFrom: row.refined_from ?? null,
      pinnedAt: row.pinned_at,
      mutedAt: row.muted_at,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      sourceApp: row.source_app ?? null,
      promotedAt: row.promoted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      score,
      scopeMatchScore,
      semanticScore: row.semantic_score,
    } satisfies ScoredLearning
  })
}
