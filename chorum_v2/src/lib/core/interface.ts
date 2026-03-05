// src/lib/core/interface.ts
// The ONLY export from src/lib/core/ that Layer 2 may import.
// No direct Podium or Conductor internals from Layer 2+.

import type { ScopeFilter } from '@/lib/nebula/types'

// ---------------------------------------------------------------------------
// Podium types — re-exported for Layer 2
// ---------------------------------------------------------------------------

export type QueryIntent =
  | 'question'
  | 'generation'
  | 'analysis'
  | 'debugging'
  | 'discussion'
  | 'continuation'
  | 'greeting'

export type QueryComplexity = 'simple' | 'moderate' | 'complex'

export interface DomainSignal {
  primary: string | null
  // null means domain is unclear. Podium scores all types; no domain boost applied.
  // There is no fallback domain label. This is a contract invariant.
  confidence: number
  detected: string[]
}

export interface PodiumRequest {
  userId: string
  conversationId: string
  queryText: string
  queryEmbedding: number[]
  scopeFilter: ScopeFilter
  domainSignal: DomainSignal
  intent: QueryIntent
  contextWindowSize: number
}

export interface InjectedLearning {
  id: string
  content: string
  type: string
  confidence: number
  relevanceScore: number
  tokenCount: number
}

export interface PodiumResult {
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  compiledContext: string
  auditEntries: {
    learningId: string | null
    included: boolean
    score: number
    reason: string | null
    excludeReason: string | null
  }[]
}

// ---------------------------------------------------------------------------
// Conductor types — re-exported for Layer 2
// ---------------------------------------------------------------------------

export type ConductorSignalType = 'explicit' | 'heuristic' | 'inaction' | 'end_of_session_judge'

export interface ConductorSignal {
  type: ConductorSignalType
  learningId: string
  conversationId: string
  injectionId: string
  signal: 'positive' | 'negative' | 'none'
  source: string
  timestamp: Date
}

export type ProposalType = 'promote' | 'demote' | 'archive' | 'merge'

export interface ConductorProposal {
  id: string
  type: ProposalType
  targetLearningId: string
  confidenceDelta: number
  rationale: string
  requiresHumanApproval: boolean
  expiresAt: Date
  createdAt: Date
}

// ---------------------------------------------------------------------------
// BinaryStarInterface — the Layer 1 contract
// ---------------------------------------------------------------------------

export interface BinaryStarInterface {
  // Podium: context injection
  getContext(request: PodiumRequest): Promise<PodiumResult>

  // Conductor: feedback loop
  submitSignal(signal: ConductorSignal): Promise<void>
  getProposals(userId: string): Promise<ConductorProposal[]>
  createProposal(
    userId: string,
    learningId: string,
    type: ProposalType,
    delta: number,
    rationale: string,
  ): Promise<ConductorProposal>
  maybeFireSessionJudge(userId: string, conversationId: string, injectedIds: string[]): Promise<void>
  approveProposal(proposalId: string, userId: string): Promise<void>
  rejectProposal(proposalId: string, userId: string): Promise<void>
}
