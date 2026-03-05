# Layer Contracts

**Phase:** 0 (pre-implementation)
**Status:** Locked
**Governs:** Import direction, layer responsibilities, all inter-layer TypeScript interfaces

---

## Purpose

Define the explicit TypeScript interfaces at every layer boundary. No layer may call another except through its published interface. No inner layer may import from an outer layer. These contracts are enforced by `chorum-layer-guardian` at every phase boundary.

## Non-Goals

- Does not specify implementation details (those live in phase-specific specs)
- Does not define database schema (see NEBULA_SCHEMA_SPEC.md)
- Does not define MCP wire format (see CONDUCTOR_INTERFACE_SPEC.md Phase 3 addendum)

---

## Layer Map

| # | Name | Directory | Responsibility | May Import From |
|---|------|-----------|----------------|-----------------|
| 0 | Nebula | `src/lib/nebula/` | Persistent knowledge graph; CRUD; embedding search | Nothing in `src/lib/` |
| 1 | Binary Star | `src/lib/core/` | Podium (injection) + Conductor (feedback) | Layer 0 only |
| 2 | Customization | `src/lib/customization/` | Domain profiles, decay config, MCP surface, ChorumClient adapter | Layers 0–1 |
| 3 | Agents | `src/lib/agents/` | Personas, routing, tool access | Layers 0–2 |
| 4 | Shell | `src/app/` | UI, CLI, API routes — stateless | All layers (via interfaces only) |

**Import direction rule:** imports flow inward only. Layer N may import from layers < N. Layer N must never import from layers > N.

```
Layer 0 ← Layer 1 ← Layer 2 ← Layer 3 ← Layer 4
```

---

## Shared Primitive Types

```typescript
// src/lib/nebula/types.ts — shared across all layers
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
  include: string[]    // scope tags that must be present (AND)
  exclude: string[]    // scope tags that must not be present
  boost: string[]      // scope tags that add score bonus (OR)
}

export interface Learning {
  id: string
  userId: string
  teamId: string | null
  content: string
  type: LearningType
  confidenceBase: number    // raw score; never modified by decay tick
  confidence: number        // effective value; updated by nightly decay job
  extractionMethod: ExtractionMethod
  sourceConversationId: string | null
  pinnedAt: Date | null
  mutedAt: Date | null
  usageCount: number
  lastUsedAt: Date | null
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
  | 'admin'
```

---

## Layer 0 → Layer 1: NebulaInterface

The only export from `src/lib/nebula/` that Layer 1 may import is `NebulaInterface`. No direct table access from Layer 1.

```typescript
// src/lib/nebula/interface.ts
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

export interface CreateLearningInput {
  userId: string
  teamId?: string
  content: string
  type: LearningType
  extractionMethod: ExtractionMethod
  sourceConversationId?: string
  scopes: string[]
  confidenceBase?: number      // default 0.5
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

export interface NebulaInterface {
  // Node CRUD
  createLearning(input: CreateLearningInput): Promise<Learning>
  getLearning(id: string): Promise<Learning | null>
  updateLearning(id: string, patch: Partial<Learning>): Promise<Learning>
  deleteLearning(id: string): Promise<void>           // hard delete — explicit call required

  // Scope queries
  getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]>

  // Semantic search — queries best available embedding table (1536 → 384 → scope/recency)
  // userId is required; all results are scoped to the calling user at DB level (no cross-tenant leakage).
  // allowCrossLens: if false (default), scope filter is enforced against caller's project scope_filter
  // Cross-lens access must be logged in injection_audit with reason = 'cross-lens'
  searchByEmbedding(
    userId: string,          // AMENDMENT: added Phase 1b — enforced at DB level
    embedding: number[],
    dims: 384 | 1536,
    scopeFilter: ScopeFilter,
    limit: number,
    allowCrossLens?: boolean
  ): Promise<ScoredLearning[]>

  // Usage tracking — atomic increment; called by Podium after injection
  incrementUsageCount(ids: string[]): Promise<void>  // AMENDMENT: added Phase 2

  // Embedding management
  setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void>
  hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean>
  getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]>

  // Graph
  createLink(sourceId: string, targetId: string, type: LinkType, strength: number): Promise<void>
  getLinksFor(learningId: string): Promise<LearningLink[]>

  // Co-occurrence
  recordCooccurrence(ids: string[]): Promise<void>
  getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]>

  // Feedback
  recordFeedback(input: FeedbackInput): Promise<void>
  getPendingFeedback(userId: string): Promise<Feedback[]>
  markFeedbackProcessed(ids: string[]): Promise<void>

  // Injection audit
  logInjectionAudit(entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[]): Promise<void>

  // API token auth
  validateApiToken(hashedToken: string): Promise<ApiToken | null>
  createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }>
  revokeApiToken(id: string): Promise<void>
}
```

---

## Layer 1 → Layer 2: BinaryStarInterface

The only export from `src/lib/core/` that Layer 2 may import.

```typescript
// src/lib/core/interface.ts
import type { ScopeFilter, Learning } from '@/lib/nebula/types'

// --- Podium types ---

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
  primary: string | null   // e.g. 'coding' | 'writing' | 'trading' — or null if unknown
  // null means domain is unclear. Podium scores all types; no domain boost applied.
  // There is no 'general' fallback domain.
  confidence: number       // 0–1
  detected: string[]       // all detected scope tags / cluster labels
}

export interface PodiumRequest {
  userId: string
  conversationId: string
  queryText: string
  queryEmbedding: number[]     // pre-computed — never deferred
  scopeFilter: ScopeFilter
  domainSignal: DomainSignal
  intent: QueryIntent
  contextWindowSize: number    // determines tier
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

// --- Conductor types ---

export type ConductorSignalType = 'explicit' | 'heuristic' | 'inaction' | 'end_of_session_judge'

export interface ConductorSignal {
  type: ConductorSignalType
  learningId: string
  conversationId: string
  injectionId: string          // links to Podium audit entry
  signal: 'positive' | 'negative' | 'none'
  source: string
  timestamp: Date
}

export type ProposalType = 'promote' | 'demote' | 'archive' | 'merge'

export interface ConductorProposal {
  id: string
  type: ProposalType
  targetLearningId: string
  confidenceDelta: number      // applied to confidence_base
  rationale: string
  requiresHumanApproval: boolean
  expiresAt: Date
  createdAt: Date
}

export interface BinaryStarInterface {
  // Podium
  getContext(request: PodiumRequest): Promise<PodiumResult>

  // Conductor
  submitSignal(signal: ConductorSignal): Promise<void>
  getProposals(userId: string): Promise<ConductorProposal[]>
  createProposal(          // AMENDMENT: added Phase 3 — routes handlers.ts through the interface
    userId: string,
    learningId: string,
    type: ProposalType,
    delta: number,
    rationale: string,
  ): Promise<ConductorProposal>
  maybeFireSessionJudge(   // AMENDMENT: added Phase 3 — triggered at end_session
    userId: string,
    conversationId: string,
    injectedIds: string[]
  ): Promise<void>
  approveProposal(proposalId: string, userId: string): Promise<void>
  rejectProposal(proposalId: string, userId: string): Promise<void>
}
```

---

## Layer 2 → Layer 3: ChorumClientInterface

The interface Agents call. Implemented by either `LocalChorumClient` (co-located) or `MCPChorumClient` (external). Layer 3 never imports transport details.

```typescript
// src/lib/customization/client.ts
export interface ReadNebulaParams {
  userId: string
  query: string
  scopes?: string[]
  limit?: number
  minConfidence?: number
}

export interface ReadNebulaResult {
  learnings: {
    id: string
    content: string
    type: string
    confidence: number
    scopes: string[]
    relevanceScore: number
  }[]
  totalMatches: number
}

export interface GetContextParams {
  userId: string
  conversationId?: string
  query: string
  scopes?: string[]
  domain?: string
  maxTokens?: number
  tier?: 1 | 2 | 3
}

export interface GetContextResult {
  compiledContext: string
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  itemCount: number
  learningIds: string[]
  auditSummary: string
}

export interface InjectLearningParams {
  userId: string
  content: string
  type: string
  scopes: string[]
  source?: 'manual' | 'import' | 'extraction'
  confidence?: number
  conversationId?: string
}

export interface InjectLearningResult {
  id: string
  status: 'created' | 'queued'
  message: string
}

export interface SubmitFeedbackParams {
  userId: string
  learningId: string
  signal: 'positive' | 'negative'
  conversationId?: string
  injectionId?: string
  reason?: string
}

export interface SubmitFeedbackResult {
  received: boolean
  adjustmentApplied: boolean
  newConfidence?: number
}

export interface ChorumClientInterface {
  readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult>
  getContext(params: GetContextParams): Promise<GetContextResult>
  injectLearning(params: InjectLearningParams): Promise<InjectLearningResult>
  submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult>
}
```

---

## Layer 3 → Layer 4: AgentInterface

The interface Shell calls. Layer 4 never calls Layer 2 or below directly.

```typescript
// src/lib/agents/interface.ts
export interface AgentDefinition {
  id: string
  name: string
  description: string
  scopeFilter: string[]       // default scopes this agent operates in
  systemPromptTemplate: string
  temperature: number
  maxTokens: number
  guardrails: string[]
}

export interface AgentChatInput {
  userId: string
  conversationId: string
  message: string
  agentId?: string             // if null, route automatically
  history: { role: 'user' | 'assistant'; content: string }[]
  contextWindowSize: number
}

export interface AgentChatResult {
  response: string
  agentUsed: AgentDefinition
  injectedContext: string
  tokensUsed: number
  conversationId: string
}

export interface AgentInterface {
  chat(input: AgentChatInput): AsyncGenerator<string>    // streaming
  chatSync(input: AgentChatInput): Promise<AgentChatResult>
  getAgents(userId: string): Promise<AgentDefinition[]>
  route(query: string, userId: string): Promise<AgentDefinition>
}
```

---

## Invariants

1. **No outer→inner imports.** Layer N may never import from Layer > N. `chorum-layer-guardian` enforces this.
2. **Shell is stateless.** `src/app/` contains no business logic, no scoring, no confidence adjustments.
3. **Interfaces are the contracts.** If implementation diverges from these interfaces, update the spec first, then the code.
4. **`NebulaInterface` is the only Nebula export.** No direct table imports from Layer 1+.
5. **`any` is forbidden** without a documented justification comment.

## Error Handling

- Layer 0 throws typed errors: `class NebulaError extends Error { constructor(code: NebulaErrorCode, message: string) }`
- Layer 1 wraps Layer 0 errors — does not re-expose DB error internals to Layer 2+
- Layer 4 maps errors to HTTP status codes — never expose stack traces to clients
- All async functions declare return types (no inferred `Promise<any>`)

## Testing Contract

- Every interface method must have at least one unit test by the time its phase ships
- Invariant violations must have negative tests (prove that Layer 0 cannot be imported from Layer 2)
- Test files live adjacent to source: `src/lib/nebula/interface.test.ts`

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Business logic in `src/app/api/` routes | Shell is stateless; all logic in lib layers |
| No defined interfaces between learning and relevance systems | This document — every boundary is typed |
| `projectLearningPaths` — learnings owned by projects | Learnings tagged, never owned; projects are scope filters |
| Relevance engine imported directly in API routes | Layer 4 calls `AgentInterface` only |
```

---
## Interface(s)

See the interface definitions throughout this document:
- **Layer 0 → Layer 1:** `NebulaInterface` in `src/lib/nebula/interface.ts`
- **Layer 1 → Layer 2:** `BinaryStarInterface` in `src/lib/core/interface.ts`
- **Layer 2 → Layer 3:** `ChorumClientInterface` in `src/lib/customization/client.ts`
- **Layer 3 → Layer 4:** `AgentInterface` in `src/lib/agents/interface.ts`