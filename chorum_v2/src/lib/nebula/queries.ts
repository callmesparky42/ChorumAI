// src/lib/nebula/queries.ts
import { db } from '@/db'
import { learnings, learningScopes } from '@/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { Learning, LearningType, ExtractionMethod } from './types'
import type { CreateLearningInput } from './interface'
import { NebulaError } from './errors'
import { findNearDuplicate, mergeWithExisting } from './dedup'
import { setEmbedding } from './embeddings'

// ---------------------------------------------------------------------------
// Row → domain type mapper
// ---------------------------------------------------------------------------

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
    promotedAt: row.promotedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// createLearning — Phase 1b dedup integration
// ---------------------------------------------------------------------------

export async function createLearning(input: CreateLearningInput): Promise<Learning> {
  // Validate: no '#general' scope tag
  if (input.scopes.includes('#general')) {
    throw new NebulaError('DUPLICATE_SCOPE_TAG', "'#general' is a forbidden scope tag")
  }

  // Phase 1b: Write-time semantic dedup (only when embedding provided)
  if (input.embedding && input.embeddingDims) {
    const dedup = await findNearDuplicate(
      input.userId,
      input.type,
      input.embedding,
      input.embeddingDims,
    )
    if (dedup.isDuplicate && dedup.existingId) {
      // Newer wording wins. Generate a temp ID to record lineage then discard.
      const tempId = crypto.randomUUID()
      await mergeWithExisting(dedup.existingId, input.content, tempId)
      const existing = await getLearning(dedup.existingId)
      if (!existing) throw new NebulaError('INTERNAL', 'Dedup target vanished during merge')
      return existing
    }
  }

  // Insert learning row
  const [row] = await db
    .insert(learnings)
    .values({
      userId: input.userId,
      teamId: input.teamId ?? null,
      content: input.content,
      type: input.type,
      confidenceBase: input.confidenceBase ?? 0.5,
      confidence: input.confidenceBase ?? 0.5,
      extractionMethod: input.extractionMethod,
      sourceConversationId: input.sourceConversationId ?? null,
    })
    .returning()

  if (!row) throw new NebulaError('INTERNAL', 'Insert returned no row')

  // Insert scope tags
  if (input.scopes.length > 0) {
    await db.insert(learningScopes).values(
      input.scopes.map((scope) => ({ learningId: row.id, scope }))
    )
  }

  // Store embedding (if provided) so learning is immediately searchable
  if (input.embedding && input.embeddingDims && input.embeddingModel) {
    await setEmbedding(row.id, input.embedding, input.embeddingDims, input.embeddingModel)
  }

  return rowToLearning(row)
}

// ---------------------------------------------------------------------------
// getLearning
// ---------------------------------------------------------------------------

export async function getLearning(id: string): Promise<Learning | null> {
  const row = await db.query.learnings.findFirst({ where: eq(learnings.id, id) })
  return row ? rowToLearning(row) : null
}

// ---------------------------------------------------------------------------
// updateLearning
// ---------------------------------------------------------------------------

export async function updateLearning(
  id: string,
  patch: Partial<Pick<Learning,
    'content' | 'type' | 'confidenceBase' | 'confidence' |
    'pinnedAt' | 'mutedAt' | 'usageCount' | 'lastUsedAt' | 'promotedAt'
  >>,
): Promise<Learning> {
  const update: Partial<typeof learnings.$inferInsert> = { updatedAt: new Date() }

  if (patch.content !== undefined) update.content = patch.content
  if (patch.type !== undefined) update.type = patch.type
  if (patch.confidenceBase !== undefined) update.confidenceBase = patch.confidenceBase
  if (patch.confidence !== undefined) update.confidence = patch.confidence
  if (patch.pinnedAt !== undefined) update.pinnedAt = patch.pinnedAt
  if (patch.mutedAt !== undefined) update.mutedAt = patch.mutedAt
  if (patch.usageCount !== undefined) update.usageCount = patch.usageCount
  if (patch.lastUsedAt !== undefined) update.lastUsedAt = patch.lastUsedAt
  if (patch.promotedAt !== undefined) update.promotedAt = patch.promotedAt

  const [row] = await db
    .update(learnings)
    .set(update)
    .where(eq(learnings.id, id))
    .returning()

  if (!row) throw new NebulaError('NOT_FOUND', `Learning ${id} not found`)
  return rowToLearning(row)
}

// ---------------------------------------------------------------------------
// deleteLearning
// ---------------------------------------------------------------------------

export async function deleteLearning(id: string): Promise<void> {
  await db.delete(learnings).where(eq(learnings.id, id))
}

// ---------------------------------------------------------------------------
// getLearningsByScope
// ---------------------------------------------------------------------------

export async function getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]> {
  // Returns learnings where user_id matches AND at least one scope matches
  // (intersection semantics; Layer 1 applies AND/exclude logic from ScopeFilter)
  const rows = await db
    .selectDistinct({ learning: learnings })
    .from(learnings)
    .innerJoin(learningScopes, eq(learningScopes.learningId, learnings.id))
    .where(
      and(
        eq(learnings.userId, userId),
        inArray(learningScopes.scope, scopes),
      )
    )

  return rows.map((r) => rowToLearning(r.learning))
}

// ---------------------------------------------------------------------------
// incrementUsageCount
// ---------------------------------------------------------------------------

export async function incrementUsageCount(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(learnings)
    .set({
      usageCount: sql`${learnings.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(inArray(learnings.id, ids))
}