// src/lib/nebula/types.ts
// Shared primitive types — source of truth for all layers.
// Imported by Layer 1+ through NebulaInterface; not through direct table imports.

export type LearningType =
  | 'invariant'
  | 'pattern'
  | 'decision'
  | 'antipattern'
  | 'golden_path'
  | 'anchor'
  | 'character'
  | 'setting'
  | 'plot_thread'
  | 'voice'
  | 'world_rule'

export type LinkType = 'related' | 'supports' | 'contradicts' | 'supersedes'

export type ExtractionMethod = 'manual' | 'auto' | 'import'

export type SignalSource = 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'

export type SignalValue = 'positive' | 'negative' | 'none'

export interface ScopeFilter {
  include: string[]    // scope tags that must be present (AND match)
  exclude: string[]    // scope tags that must not be present
  boost: string[]    // scope tags that add a relevance bonus (OR match)
}

export interface Learning {
  id: string
  userId: string
  teamId: string | null
  content: string
  type: LearningType
  confidenceBase: number    // raw score; never modified by decay tick
  confidence: number    // effective value; updated by nightly decay job
  extractionMethod: ExtractionMethod
  sourceConversationId: string | null
  refinedFrom: string | null  // UUID of the learning this one superseded wording for; both remain active
  pinnedAt: Date | null
  mutedAt: Date | null
  usageCount: number
  lastUsedAt: Date | null
  sourceApp: string | null
  promotedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ScoredLearning extends Learning {
  score: number
  scopeMatchScore: number
  semanticScore: number
}

export interface LearningLink {
  id: string
  sourceId: string
  targetId: string
  linkType: LinkType
  strength: number
  createdAt: Date
}

export interface CooccurrenceEntry {
  learningId: string
  count: number
  positiveCount: number
  negativeCount: number
  lastSeen: Date
}

export interface Feedback {
  id: string
  userId: string
  learningId: string | null
  conversationId: string | null
  injectionId: string | null
  signal: SignalValue
  source: SignalSource
  processed: boolean
  createdAt: Date
}

export interface InjectionAuditEntry {
  id: string
  userId: string
  conversationId: string | null
  learningId: string | null
  included: boolean
  score: number
  reason: string | null
  excludeReason: string | null
  tierUsed: 1 | 2 | 3
  tokensUsed: number | null
  createdAt: Date
}

export interface ApiToken {
  id: string
  userId: string
  name: string
  hashedToken: string
  scopes: TokenScope[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export type TokenScope =
  | 'read:nebula'
  | 'write:nebula'
  | 'write:feedback'
  | 'read:health'
  | 'write:health'
  | 'admin'
