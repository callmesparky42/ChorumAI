// src/lib/nebula/interface.ts
// The ONLY public export from src/lib/nebula/ that Layer 1 may import.
// No direct table imports from Layer 1+. See docs/specs/LAYER_CONTRACTS.md.

import type {
  Learning,
  ScoredLearning,
  LearningLink,
  LinkType,
  CooccurrenceEntry,
  Feedback,
  InjectionAuditEntry,
  ApiToken,
  ScopeFilter,
  ExtractionMethod,
  LearningType,
} from './types'

export type {
  Learning, ScoredLearning, LearningLink, CooccurrenceEntry,
  Feedback, InjectionAuditEntry, ApiToken, ScopeFilter,
  LearningType, ExtractionMethod
} from './types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateLearningInput {
  userId: string
  teamId?: string
  content: string
  type: LearningType
  extractionMethod: ExtractionMethod
  sourceConversationId?: string
  scopes: string[]
  confidenceBase?: number        // default 0.5

  // Phase 1b: optional embedding for write-time semantic dedup.
  // If provided, createLearning checks for near-duplicates (threshold 0.85,
  // same type + same user). If a duplicate is found: update existing wording
  // (newer wording wins) and return the existing learning. No new row.
  embedding?: number[]
  embeddingDims?: 384 | 1536
  embeddingModel?: string
}

export interface FeedbackInput {
  userId: string
  learningId?: string
  conversationId?: string
  injectionId?: string
  signal: 'positive' | 'negative' | 'none'
  source: 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'
}

export interface CreateApiTokenInput {
  userId: string
  name: string
  scopes: string[]
  expiresAt?: Date
}

// ---------------------------------------------------------------------------
// NebulaInterface — the Layer 0 contract
// ---------------------------------------------------------------------------

export interface NebulaInterface {
  // --- Node CRUD ---

  /** Create a learning. Runs write-time dedup if embedding provided. */
  createLearning(input: CreateLearningInput): Promise<Learning>

  getLearning(id: string): Promise<Learning | null>

  updateLearning(id: string, patch: Partial<Pick<Learning,
    'content' | 'type' | 'confidenceBase' | 'confidence' |
    'pinnedAt' | 'mutedAt' | 'usageCount' | 'lastUsedAt' | 'promotedAt'
  >>): Promise<Learning>

  /** Increment usage count and update lastUsedAt for the given learning IDs. Fire-and-forget. */
  incrementUsageCount(ids: string[]): Promise<void>

  /** Hard delete — explicit call required. Cascades to embeddings, scopes, links. */
  deleteLearning(id: string): Promise<void>

  // --- Scope queries ---

  /** Returns all learnings matching ALL include scopes and NONE of the exclude scopes. */
  getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]>

  // --- Semantic search ---

  /**
   * Semantic similarity search using the best available embedding table.
   * Priority: embeddings_1536 → embeddings_384 → (fallback: scope + recency sort, no semantic score)
   *
   * If allowCrossLens is false (default):
   *   - scopeFilter.include must not be empty
   *   - Results are filtered to learnings whose scopes intersect scopeFilter.include
   *   - A query that would return results ONLY from outside the scope filter throws NebulaError('CROSS_LENS_DENIED')
   *
   * If allowCrossLens is true:
   *   - scope filter is still applied but not enforced as a hard cutoff
   *   - Each cross-lens result is logged in injection_audit with reason = 'cross-lens'
   *   - Caller must have project.crossLensAccess = true (enforced by Layer 1, not Layer 0)
   */
  searchByEmbedding(
    userId: string,
    embedding: number[],
    dims: 384 | 1536,
    scopeFilter: ScopeFilter,
    limit: number,
    allowCrossLens?: boolean,
  ): Promise<ScoredLearning[]>

  // --- Embedding management ---

  /** Upsert an embedding row. Replaces existing embedding for this learningId + dims. */
  setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void>

  hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean>

  /** Returns learnings that have no embedding row for the given dims, for backfill jobs. */
  getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]>

  // --- Graph ---

  createLink(sourceId: string, targetId: string, type: LinkType, strength: number): Promise<void>

  getLinksFor(learningId: string): Promise<LearningLink[]>

  // --- Co-occurrence ---

  /**
   * Record that a set of learnings appeared together in the same injection.
   * For every ordered pair (a, b) where a < b: upsert cooccurrence row (increment count).
   * Silently skips if ids.length < 2.
   */
  recordCooccurrence(ids: string[]): Promise<void>

  /** Returns learnings that most frequently co-occur with the given learning. */
  getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]>

  // --- Feedback ---

  recordFeedback(input: FeedbackInput): Promise<void>

  getPendingFeedback(userId: string): Promise<Feedback[]>

  markFeedbackProcessed(ids: string[]): Promise<void>

  // --- Injection audit ---

  logInjectionAudit(entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[]): Promise<void>

  // --- API token auth ---

  /** Looks up a hashed token. Returns null if not found, expired, or revoked. */
  validateApiToken(hashedToken: string): Promise<ApiToken | null>

  /** Creates a new token. Returns the plain-text token (shown once) + the stored record. */
  createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }>

  revokeApiToken(id: string): Promise<void>
}