# Phase 2 Specification: Binary Star Core (Layer 1) — Podium + Conductor

**Version:** 1.0
**Date:** 2026-02-23
**Status:** Ready for execution
**Assigned to:** Gemini 3.1 (Phase 2a — Podium scoring algorithms) | Codex 5.3 (Phase 2b — Conductor + wiring)
**Guardian gates:** `podium-injection-agent`, `conductor-spec-agent`, `chorum-layer-guardian`
**Prerequisite:** Phase 1 complete — all 14 tables exist; `NebulaInterface` implemented; `nebula-schema-guardian` passing

---

## Agent Instructions

You are executing **Phase 2** of the Chorum 2.0 build. This phase implements the Binary Star Core — Layer 1 — which sits directly above Nebula. Podium decides what context to inject. Conductor closes the feedback loop. They share the same Nebula interface. They cannot import each other.

Read this document completely before writing a single file. Every decision is locked.

**What you will produce:**
1. `drizzle/0002_user_settings.sql` — one new table: `user_settings`
2. `src/db/schema.ts` amendment — add `userSettings` table definition
3. `src/lib/core/interface.ts` — full `BinaryStarInterface` replacing the Phase 0 stub
4. `src/lib/core/podium/` — 6 files (Podium implementation)
5. `src/lib/core/conductor/` — 10 files (Conductor implementation)
6. `src/lib/core/impl.ts` — BinaryStar wiring
7. `src/lib/core/index.ts` — updated re-exports
8. `src/app/api/cron/decay/route.ts` — nightly decay tick
9. `src/app/api/cron/zombie-recovery/route.ts` — conductor queue recovery

**What you will NOT produce:**
- Any MCP endpoint implementation (Phase 3)
- Any UI components (Phase 5)
- Any embedding computation — embeddings are passed in by callers
- Any `any` types or `@ts-ignore` comments

**Layer 1 import rule:** `src/lib/core/` may only import from `@/lib/nebula` and third-party packages. No imports from `@/lib/customization`, `@/lib/agents`, or `@/app`. Within `src/lib/core/`, Podium and Conductor may not import each other — they communicate only through the shared `NebulaInterface`.

---

## Reference Documents

| Document | Location | Governs |
|----------|----------|---------|
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | BinaryStarInterface, PodiumRequest/Result, ConductorSignal/Proposal |
| Podium Spec | `docs/specs/PODIUM_INTERFACE_SPEC.md` | Scoring formula, tier budgets, type weights, intent profiles |
| Conductor Spec | `docs/specs/CONDUCTOR_INTERFACE_SPEC.md` | Signal policy, confidence formula, guardrails, zombie recovery |
| Phase Architecture | `CHORUM_V2_PHASE_ARCHITECTURE.md` | Decay formula, heuristic signals, queue schema |
| Checklist | `CHECKLIST_2.0.md` | Phase 2 → Phase 3 transition gates |

---

## Phase 1 Interface Extension

Phase 2 requires one addition to `NebulaInterface` that was not anticipated in Phase 1. Add it now before writing any Phase 2 files.

**Why:** Podium fires a fire-and-forget usageCount increment for every injected learning. The current `updateLearning(id, patch)` requires a read-before-write. An atomic increment is safer and simpler.

### Amendment to `src/lib/nebula/interface.ts`

Add to `NebulaInterface`:

```typescript
/** Atomically increment usage_count and set last_used_at for multiple learnings. Fire-and-forget safe. */
incrementUsageCount(ids: string[]): Promise<void>
```

### Amendment to `src/lib/nebula/queries.ts`

Add implementation:

```typescript
export async function incrementUsageCount(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const now = new Date()
  await db
    .update(learnings)
    .set({
      usageCount: sql`${learnings.usageCount} + 1`,
      lastUsedAt: now,
    })
    .where(inArray(learnings.id, ids))
}
```

### Amendment to `src/lib/nebula/impl.ts`

Add to `NebulaImpl`:

```typescript
async incrementUsageCount(ids: string[]): Promise<void> {
  return incrementUsageCount(ids)
}
```

### Amendment to `src/lib/nebula/index.ts`

No change needed — `NebulaInterface` is already re-exported and callers pick up the new method automatically.

---

## Step 1: Migration `drizzle/0002_user_settings.sql`

This migration adds the `user_settings` table that Phase 2 needs for the Conductor's end-of-session judge toggle (and future per-user config).

### 1.1 Write the migration file

```sql
-- drizzle/0002_user_settings.sql
-- Phase 2: User settings table for Conductor configuration

CREATE TABLE user_settings (
  id                             UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  end_of_session_judge_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Future columns added here (Phase 3: decayConfigOverride, Phase 5: theme, etc.)
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_settings_id_idx ON user_settings(id);
```

### 1.2 Add to `src/db/schema.ts`

Append after `apiTokens`:

```typescript
// ---------------------------------------------------------------------------
// Table: user_settings — Per-user Conductor and UI configuration
// ---------------------------------------------------------------------------

export const userSettings = pgTable('user_settings', {
  id:                          uuid('id').primaryKey(),
  // FK to auth.users enforced in migration; omitted here (same reason as learnings.userId)
  endOfSessionJudgeEnabled:    boolean('end_of_session_judge_enabled').notNull().default(false),
  createdAt:                   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:                   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### 1.3 Apply migration

```bash
npx drizzle-kit generate --name user_settings
# Rename to 0002_user_settings.sql if needed, amend with FK to auth.users if omitted
npx drizzle-kit migrate
```

---

## Step 2: `src/lib/core/interface.ts`

Replace the Phase 0 stub entirely. This is the Layer 1 → Layer 2 contract.

```typescript
// src/lib/core/interface.ts
// The ONLY export from src/lib/core/ that Layer 2 may import.
// No direct Podium or Conductor internals from Layer 2+.

import type { ScopeFilter, Learning } from '@/lib/nebula/types'

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
  primary: string | null   // e.g. 'coding' | 'writing' | 'trading' — or null if unknown
  // null means domain is unclear. Podium scores all types; no domain boost applied.
  // There is NO 'general' fallback domain. This is a contract invariant.
  confidence: number       // 0–1
  detected: string[]       // all detected scope tags / cluster labels
}

export interface PodiumRequest {
  userId:            string
  conversationId:    string
  queryText:         string
  queryEmbedding:    number[]        // pre-computed — never deferred
  scopeFilter:       ScopeFilter
  domainSignal:      DomainSignal
  intent:            QueryIntent
  contextWindowSize: number          // determines tier; also used for budget clamping
}

export interface InjectedLearning {
  id:             string
  content:        string
  type:           string
  confidence:     number
  relevanceScore: number
  tokenCount:     number
}

export interface PodiumResult {
  injectedItems:   InjectedLearning[]
  tierUsed:        1 | 2 | 3
  tokensUsed:      number
  compiledContext: string
  auditEntries: {
    learningId:    string | null
    included:      boolean
    score:         number
    reason:        string | null
    excludeReason: string | null
  }[]
}

// ---------------------------------------------------------------------------
// Conductor types — re-exported for Layer 2
// ---------------------------------------------------------------------------

export type ConductorSignalType = 'explicit' | 'heuristic' | 'inaction' | 'end_of_session_judge'

export interface ConductorSignal {
  type:           ConductorSignalType
  learningId:     string
  conversationId: string
  injectionId:    string            // links to injection_audit.id
  signal:         'positive' | 'negative' | 'none'
  source:         string
  timestamp:      Date
}

export type ProposalType = 'promote' | 'demote' | 'archive' | 'merge'

export interface ConductorProposal {
  id:                     string
  type:                   ProposalType
  targetLearningId:       string
  confidenceDelta:        number    // applied to confidence_base if approved
  rationale:              string
  requiresHumanApproval:  boolean
  expiresAt:              Date
  createdAt:              Date
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
  approveProposal(proposalId: string, userId: string): Promise<void>
  rejectProposal(proposalId: string, userId: string): Promise<void>
}
```

---

## Step 3: Phase 2a — Podium Implementation

**Note for Gemini 3.1:** These files contain the mathematical core of injection quality. Read PODIUM_INTERFACE_SPEC.md in full before generating scorer.ts. Do not add type weights or intent profiles beyond what is specified.

---

### 3.1 `src/lib/core/podium/tiers.ts`

Tier selection, budget calculation, and the mandatory clamping fix.

```typescript
// src/lib/core/podium/tiers.ts
// Tiered context compilation. Budget clamping in ALL code paths — not optional.

export type Tier = 1 | 2 | 3

export interface TierConfig {
  tier:         Tier
  budgetPct:    number   // fraction of context window
  maxBudget:    number   // hard ceiling in tokens
}

// Tier boundaries and absolute max budgets
const TIER_CONFIGS: Record<Tier, Omit<TierConfig, 'tier'>> = {
  1: { budgetPct: 0.06, maxBudget: 960   },   // ≤ 16K window → 6%, cap 960
  2: { budgetPct: 0.08, maxBudget: 5_120 },   // 16K–64K window → 8%, cap 5120
  3: { budgetPct: 0.12, maxBudget: 12_288 },  // > 64K window → 12%, cap 12288
}

export function selectTier(contextWindowSize: number): Tier {
  if (contextWindowSize <= 16_000) return 1
  if (contextWindowSize <= 64_000) return 2
  return 3
}

export function getTierConfig(tier: Tier): TierConfig {
  return { tier, ...TIER_CONFIGS[tier] }
}

/**
 * Compute the effective token budget for this request.
 *
 * CRITICAL: clamping is applied here and ONLY here.
 * Every code path — including cache miss fallback — must call this function.
 * Do not compute budgets inline elsewhere.
 *
 * v1 bug: cache miss path called calculateBudget(tier, window) without clamping.
 * Result: a 64K window model was allocated 5,120 tokens but the cache miss fallback
 * could return 12,288. Fixed by routing all budget computation through this function.
 */
export function computeEffectiveBudget(
  contextWindowSize: number,
  requestedBudget?: number,
): { tier: Tier; effectiveBudget: number } {
  const tier   = selectTier(contextWindowSize)
  const config = getTierConfig(tier)
  const fromWindow = Math.floor(contextWindowSize * config.budgetPct)
  const unclamped  = requestedBudget !== undefined
    ? Math.min(requestedBudget, fromWindow)
    : fromWindow
  const effectiveBudget = Math.min(unclamped, config.maxBudget)
  return { tier, effectiveBudget }
}

/** Rough token estimator. 1 token ≈ 4 characters (good enough for budget management). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
```

---

### 3.2 `src/lib/core/podium/scorer.ts`

All scoring logic. The single source of truth for weights, intent profiles, and type weights.

```typescript
// src/lib/core/podium/scorer.ts
// Relevance scoring — the mathematical core of Podium.
// Every weight and profile comes from PODIUM_INTERFACE_SPEC.md. Do not add new ones.

import type { LearningType } from '@/lib/nebula/types'
import type { ScoredLearning } from '@/lib/nebula/types'
import type { DomainSignal, QueryIntent } from '../interface'
import type { ScopeFilter } from '@/lib/nebula/types'

// ---------------------------------------------------------------------------
// Intent weight profiles
// These shift the scoring formula based on what the user is trying to do.
// ---------------------------------------------------------------------------

export interface WeightProfile {
  semantic:    number
  recency:     number
  confidence:  number
  typeWeight:  number
  scopeMatch:  number
}

const INTENT_PROFILES: Record<QueryIntent, WeightProfile> = {
  question:     { semantic: 0.40, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.10 },
  generation:   { semantic: 0.40, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.10 },
  analysis:     { semantic: 0.50, recency: 0.05, confidence: 0.20, typeWeight: 0.15, scopeMatch: 0.10 },
  debugging:    { semantic: 0.30, recency: 0.35, confidence: 0.15, typeWeight: 0.10, scopeMatch: 0.10 },
  discussion:   { semantic: 0.35, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.15 },
  continuation: { semantic: 0.30, recency: 0.40, confidence: 0.15, typeWeight: 0.05, scopeMatch: 0.10 },
  greeting:     { semantic: 0.20, recency: 0.10, confidence: 0.30, typeWeight: 0.20, scopeMatch: 0.20 },
}

// ---------------------------------------------------------------------------
// Type weights by domain
// Types not listed for a domain default to 0.2 (low but non-zero).
// When domain is null: all types get 1.0 — no domain boost, no exclusion.
// ---------------------------------------------------------------------------

type DomainTypeWeights = Partial<Record<LearningType, number>>

const TYPE_WEIGHTS_BY_DOMAIN: Record<string, DomainTypeWeights> = {
  coding: {
    invariant:    1.0,
    anchor:       1.0,
    pattern:      0.9,
    decision:     0.8,
    golden_path:  0.7,
    antipattern:  0.6,
  },
  writing: {
    character:    1.0,
    world_rule:   1.0,
    anchor:       1.0,
    plot_thread:  0.9,
    voice:        0.8,
    setting:      0.7,
  },
  trading: {
    invariant:    1.0,
    anchor:       1.0,
    decision:     0.9,
    pattern:      0.8,
    antipattern:  0.7,
    golden_path:  0.6,
  },
  research: {
    decision:     1.0,
    invariant:    0.9,
    anchor:       1.0,
    pattern:      0.8,
    golden_path:  0.7,
  },
}

// Special boost multipliers for the debugging intent
const DEBUGGING_BOOSTS: Partial<Record<LearningType, number>> = {
  antipattern: 2.0,
  decision:    0.5,
}

export function getTypeWeight(
  type: LearningType,
  domain: DomainSignal['primary'],
  intent: QueryIntent,
): number {
  // When domain is null: all types score equally (no domain bias)
  if (domain === null) {
    const base = 1.0
    const boost = DEBUGGING_BOOSTS[type]
    return intent === 'debugging' && boost !== undefined ? base * boost : base
  }

  // When domain is known: look up domain-specific weight; default to 0.2
  const domainWeights = TYPE_WEIGHTS_BY_DOMAIN[domain] ?? {}
  const base = domainWeights[type] ?? 0.2

  // Apply debugging boost on top of domain weight
  const boost = DEBUGGING_BOOSTS[type]
  return intent === 'debugging' && boost !== undefined ? base * boost : base
}

// ---------------------------------------------------------------------------
// Recency scoring
// ---------------------------------------------------------------------------

export function computeRecencyScore(lastUsedAt: Date | null, createdAt: Date): number {
  const reference = lastUsedAt ?? createdAt
  const ageDays   = (Date.now() - reference.getTime()) / 86_400_000
  return Math.pow(0.5, ageDays / 30)   // halves every 30 days; 1.0 if used today
}

// ---------------------------------------------------------------------------
// Scope match scoring
// ---------------------------------------------------------------------------

export function computeScopeMatchScore(
  itemScopes:  string[],
  scopeFilter: ScopeFilter,
): number {
  const hasInclude = scopeFilter.include.length === 0
    || scopeFilter.include.some((s) => itemScopes.includes(s))
  const hasBoost = scopeFilter.boost.length > 0
    && scopeFilter.boost.some((s) => itemScopes.includes(s))

  return Math.min(1.0, (hasInclude ? 0.6 : 0) + (hasBoost ? 0.4 : 0))
}

// ---------------------------------------------------------------------------
// Primary scoring function
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
  learning:          ScoredLearning
  score:             number
  attentionDensity:  number   // score / tokenCount — the selection metric
  tokenCount:        number
  includeReason:     string
  excludeReason:     string | null
}

export function scoreCandidate(
  learning:    ScoredLearning,
  intent:      QueryIntent,
  domain:      DomainSignal['primary'],
  scopeFilter: ScopeFilter,
  itemScopes:  string[],
): Omit<ScoredCandidate, 'tokenCount' | 'attentionDensity' | 'excludeReason'> {
  const profile = INTENT_PROFILES[intent]

  const semantic   = learning.semanticScore          // 0–1, from Nebula searchByEmbedding
  const confidence = learning.confidence              // 0–1, the EFFECTIVE value (after decay)
  const recency    = computeRecencyScore(learning.lastUsedAt, learning.createdAt)
  const typeW      = getTypeWeight(learning.type as LearningType, domain, intent)
  const scopeMatch = computeScopeMatchScore(itemScopes, scopeFilter)

  const score =
    semantic   * profile.semantic +
    confidence * profile.confidence +
    typeW      * profile.typeWeight +
    recency    * profile.recency +
    scopeMatch * profile.scopeMatch

  return {
    learning,
    score,
    includeReason: `score=${score.toFixed(3)} [sem=${semantic.toFixed(2)} conf=${confidence.toFixed(2)} type=${typeW.toFixed(2)} rec=${recency.toFixed(2)} scope=${scopeMatch.toFixed(2)}]`,
  }
}
```

---

### 3.3 `src/lib/core/podium/compiler.ts`

Context string assembly — formats injected learnings into the system prompt block.

```typescript
// src/lib/core/podium/compiler.ts
// Converts selected learnings into a formatted context block.
// Output is prepended to the system prompt by the calling layer.

import type { InjectedLearning } from '../interface'
import type { Tier } from './tiers'

// Section headers per domain + type
// When domain is null, use the null column (generic headers)
const TYPE_HEADERS: Record<string, Record<string, string>> = {
  coding: {
    invariant:   '### Project Rules',
    anchor:      '### Key Facts',
    pattern:     '### Patterns',
    decision:    '### Decisions Made',
    golden_path: '### Best Practices',
    antipattern: '### Things to Avoid',
  },
  writing: {
    character:   '### Characters',
    world_rule:  '### World Rules',
    anchor:      '### Key Facts',
    plot_thread: '### Active Plot Threads',
    voice:       '### Voice & Style',
    setting:     '### Settings',
  },
  trading: {
    invariant:   '### Trading Rules',
    anchor:      '### Key Facts',
    decision:    '### Active Decisions',
    pattern:     '### Patterns',
    antipattern: '### Red Flags',
    golden_path: '### Current Playbook',
  },
}

const GENERIC_HEADERS: Record<string, string> = {
  invariant:   '### Rules',
  anchor:      '### Key Facts',
  pattern:     '### Patterns',
  decision:    '### Decisions',
  golden_path: '### How-Tos',
  antipattern: '### Avoid',
  character:   '### Characters',
  world_rule:  '### World Rules',
  plot_thread: '### Plot Threads',
  voice:       '### Voice',
  setting:     '### Settings',
}

function getHeader(type: string, domain: string | null): string {
  if (domain && TYPE_HEADERS[domain]?.[type]) return TYPE_HEADERS[domain][type]
  return GENERIC_HEADERS[type] ?? `### ${type}`
}

/**
 * Compile injected learnings into a formatted context block.
 *
 * Tier 1 format: compact — `**Fact:** content` inline
 * Tier 2 format: structured — grouped by type with section headers
 * Tier 3 format: full dossier — grouped by type, includes confidence label
 */
export function compileContext(
  items:   InjectedLearning[],
  tier:    Tier,
  domain:  string | null,
): string {
  if (items.length === 0) return ''

  const header = '<!-- chorum-context-start -->\n'
  const footer = '\n<!-- chorum-context-end -->'

  if (tier === 1) {
    // Compact: all items inline, no grouping
    const lines = items.map((item) => `- ${item.content}`).join('\n')
    return `${header}## Context\n${lines}${footer}`
  }

  // Tier 2 and 3: group by type with section headers
  const grouped = new Map<string, InjectedLearning[]>()
  for (const item of items) {
    const list = grouped.get(item.type) ?? []
    list.push(item)
    grouped.set(item.type, list)
  }

  const sections: string[] = []
  for (const [type, group] of grouped) {
    const sectionHeader = getHeader(type, domain)
    const lines = group.map((item) => {
      if (tier === 3) {
        const label = item.confidence >= 0.8 ? 'verified' : item.confidence >= 0.5 ? 'likely' : 'uncertain'
        return `- [${label}] ${item.content}`
      }
      return `- ${item.content}`
    })
    sections.push(`${sectionHeader}\n${lines.join('\n')}`)
  }

  return `${header}## Context\n\n${sections.join('\n\n')}${footer}`
}
```

---

### 3.4 `src/lib/core/podium/cache.ts`

Tier 1/2 pre-compiled context cache. TTL-based, in-memory. No persistence across restarts.

```typescript
// src/lib/core/podium/cache.ts
// In-memory TTL cache for pre-compiled Podium context.
// Invalidation is TTL-only in Phase 2. Phase 3 adds write-through invalidation.

import type { InjectedLearning } from '../interface'
import type { Tier } from './tiers'
import { estimateTokens } from './tiers'
import crypto from 'crypto'

export interface CachedContext {
  items:          InjectedLearning[]
  compiledContext: string
  tierUsed:       Tier
  tokensUsed:     number
  cachedAt:       number   // Date.now()
}

// TTL by tier — shorter for fast models (queries change more frequently)
const CACHE_TTL_MS: Record<Tier, number> = {
  1: 60_000,         // 1 minute
  2: 5 * 60_000,     // 5 minutes
  3: 15 * 60_000,    // 15 minutes
}

const store = new Map<string, CachedContext>()

function makeCacheKey(userId: string, scopeInclude: string[], domain: string | null, tier: Tier): string {
  const raw = `${userId}:${[...scopeInclude].sort().join(',')}:${domain ?? 'null'}:${tier}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

export function getCached(
  userId:       string,
  scopeInclude: string[],
  domain:       string | null,
  tier:         Tier,
): CachedContext | null {
  const key    = makeCacheKey(userId, scopeInclude, domain, tier)
  const entry  = store.get(key)
  if (!entry) return null

  const ttl = CACHE_TTL_MS[entry.tierUsed]
  if (Date.now() - entry.cachedAt > ttl) {
    store.delete(key)
    return null
  }
  return entry
}

export function setCached(
  userId:       string,
  scopeInclude: string[],
  domain:       string | null,
  tier:         Tier,
  context:      CachedContext,
): void {
  const key = makeCacheKey(userId, scopeInclude, domain, tier)
  store.set(key, context)
}

export function invalidateUser(userId: string): void {
  // Remove all cache entries for this user (prefix scan)
  // Inefficient for large caches; adequate for Phase 2 scale.
  for (const key of store.keys()) {
    const entry = store.get(key)
    if (!entry) continue
    // We can't recover userId from the hash. Clear all entries older than min TTL.
    // Phase 3: use a userId-keyed Map of sets to enable per-user invalidation.
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS[1]) {
      store.delete(key)
    }
  }
}
```

---

### 3.5 `src/lib/core/podium/podium.ts`

The Podium implementation — wires tiers, scorer, compiler, and cache.

```typescript
// src/lib/core/podium/podium.ts
import type { NebulaInterface } from '@/lib/nebula'
import type { PodiumRequest, PodiumResult, InjectedLearning } from '../interface'
import type { ScoredLearning } from '@/lib/nebula/types'
import { computeEffectiveBudget, estimateTokens } from './tiers'
import { scoreCandidate } from './scorer'
import { compileContext } from './compiler'
import { getCached, setCached } from './cache'
import type { Tier } from './tiers'

const DEFAULT_QUALITY_THRESHOLD = 0.35

export class PodiumImpl {
  constructor(private nebula: NebulaInterface) {}

  async getContext(req: PodiumRequest): Promise<PodiumResult> {
    const { tier, effectiveBudget } = computeEffectiveBudget(req.contextWindowSize)

    // --- Check cache (Tier 1 and 2 only) ---
    if (tier <= 2) {
      const cached = getCached(req.userId, req.scopeFilter.include, req.domainSignal.primary, tier)
      if (cached) {
        // Cache hit: re-audit as all-included with cached context
        return {
          injectedItems:   cached.items,
          tierUsed:        cached.tierUsed,
          tokensUsed:      cached.tokensUsed,
          compiledContext: cached.compiledContext,
          auditEntries: cached.items.map((item) => ({
            learningId:    item.id,
            included:      true,
            score:         item.relevanceScore,
            reason:        'cache-hit',
            excludeReason: null,
          })),
        }
      }
    }

    // --- Fetch candidates via semantic search ---
    let candidates: ScoredLearning[] = []
    if (req.queryEmbedding.length > 0) {
      // Determine embedding dimensions from the vector length
      const dims = req.queryEmbedding.length >= 1000 ? 1536 : 384 as 384 | 1536
      candidates = await this.nebula.searchByEmbedding(
        req.queryEmbedding,
        dims,
        req.scopeFilter,
        100,   // fetch top 100 candidates; selection reduces to budget
      )
    }

    // Fetch pinned items separately and prepend (always inject if budget allows)
    const allInScope = await this.nebula.getLearningsByScope(
      req.scopeFilter.include.length > 0 ? req.scopeFilter.include : [],
      req.userId,
    )
    const pinnedItems = allInScope.filter((l) => l.pinnedAt !== null)

    // --- Get scope tags for each candidate for scoring ---
    // Phase 2: scope tags are inferred from scopeFilter context; full per-item lookup is Phase 3+
    // For now, treat items returned by searchByEmbedding as scope-matching (Nebula enforces this)
    const itemScopesCache = new Map<string, string[]>()
    const getScopesTags = (id: string) => itemScopesCache.get(id) ?? req.scopeFilter.include

    // --- Score candidates ---
    const auditEntries: PodiumResult['auditEntries'] = []
    const scored = candidates.map((c) => {
      const { score, includeReason } = scoreCandidate(
        c,
        req.intent,
        req.domainSignal.primary,
        req.scopeFilter,
        getScopesTags(c.id),
      )
      const tokenCount = estimateTokens(c.content)
      return {
        learning:         c,
        score,
        tokenCount,
        attentionDensity: tokenCount > 0 ? score / tokenCount : 0,
        includeReason,
      }
    })

    // Sort by attention density (score / tokenCount) — not raw score
    scored.sort((a, b) => b.attentionDensity - a.attentionDensity)

    // --- Selection pass ---
    let remainingBudget = effectiveBudget
    const selected:  InjectedLearning[] = []
    const excluded:  typeof scored      = []

    // Pinned items first (always inject, consume budget)
    for (const pinned of pinnedItems) {
      const tokenCount = estimateTokens(pinned.content)
      if (tokenCount <= remainingBudget) {
        remainingBudget -= tokenCount
        selected.push({
          id:             pinned.id,
          content:        pinned.content,
          type:           pinned.type,
          confidence:     pinned.confidence,
          relevanceScore: 1.0,    // pinned = always relevant
          tokenCount,
        })
        auditEntries.push({
          learningId:    pinned.id,
          included:      true,
          score:         1.0,
          reason:        'pinned',
          excludeReason: null,
        })
      }
    }

    // Fill remaining budget with scored candidates
    for (const candidate of scored) {
      // Skip if this is also a pinned item (already added above)
      if (candidate.learning.pinnedAt !== null) continue

      if (candidate.score < DEFAULT_QUALITY_THRESHOLD) {
        excluded.push(candidate)
        auditEntries.push({
          learningId:    candidate.learning.id,
          included:      false,
          score:         candidate.score,
          reason:        null,
          excludeReason: `score ${candidate.score.toFixed(3)} below quality threshold ${DEFAULT_QUALITY_THRESHOLD}`,
        })
        continue
      }

      if (candidate.tokenCount > remainingBudget) {
        excluded.push(candidate)
        auditEntries.push({
          learningId:    candidate.learning.id,
          included:      false,
          score:         candidate.score,
          reason:        null,
          excludeReason: `tokenCount ${candidate.tokenCount} exceeds remaining budget ${remainingBudget}`,
        })
        continue
      }

      remainingBudget -= candidate.tokenCount
      selected.push({
        id:             candidate.learning.id,
        content:        candidate.learning.content,
        type:           candidate.learning.type,
        confidence:     candidate.learning.confidence,
        relevanceScore: candidate.score,
        tokenCount:     candidate.tokenCount,
      })
      auditEntries.push({
        learningId:    candidate.learning.id,
        included:      true,
        score:         candidate.score,
        reason:        candidate.includeReason,
        excludeReason: null,
      })
    }

    const tokensUsed      = effectiveBudget - remainingBudget
    const compiledContext = compileContext(selected, tier, req.domainSignal.primary)

    // --- Write injection audit to Nebula (all decisions) ---
    await this.nebula.logInjectionAudit(
      auditEntries.map((e) => ({
        userId:         req.userId,
        conversationId: req.conversationId,
        learningId:     e.learningId,
        included:       e.included,
        score:          e.score,
        reason:         e.reason,
        excludeReason:  e.excludeReason,
        tierUsed:       tier,
        tokensUsed:     e.included ? (selected.find((s) => s.id === e.learningId)?.tokenCount ?? null) : null,
      }))
    )

    // --- Fire-and-forget: increment usageCount for injected items ---
    const injectedIds = selected.map((s) => s.id)
    if (injectedIds.length > 0) {
      this.nebula.incrementUsageCount(injectedIds).catch(() => { /* non-critical */ })
    }

    // --- Populate cache (Tier 1/2 only) ---
    if (tier <= 2 && selected.length > 0) {
      setCached(req.userId, req.scopeFilter.include, req.domainSignal.primary, tier, {
        items: selected, compiledContext, tierUsed: tier, tokensUsed, cachedAt: Date.now(),
      })
    }

    return { injectedItems: selected, tierUsed: tier, tokensUsed, compiledContext, auditEntries }
  }
}

export function createPodium(nebula: NebulaInterface): PodiumImpl {
  return new PodiumImpl(nebula)
}
```

---

### 3.6 `src/lib/core/podium/index.ts`

```typescript
// src/lib/core/podium/index.ts
export { createPodium, PodiumImpl } from './podium'
```

---

## Step 4: Phase 2b — Conductor Implementation

**Note for Codex 5.3:** These files implement the feedback loop. The signal policy is inviolable. Read CONDUCTOR_INTERFACE_SPEC.md fully before generating signals.ts or confidence.ts. The guardrails in guardrails.ts must be checked before every confidence write.

---

### 4.1 `src/lib/core/conductor/decay.ts`

Single source of truth for decay math. This function is called by the nightly cron tick — not by Podium at query time (that would double-decay items).

```typescript
// src/lib/core/conductor/decay.ts
// Decay formula — single source of truth.
// Called by the nightly decay cron tick, NOT by Podium at query time.
// Podium reads the already-decayed `confidence` column from the DB.

import type { LearningType } from '@/lib/nebula/types'

/** Types that decay and their half-lives in days. Undefined = no decay (immortal). */
export const HALF_LIFE_DAYS: Partial<Record<LearningType, number>> = {
  decision:    365,
  pattern:     90,
  voice:       90,
  plot_thread: 90,
  setting:     180,
  golden_path: 30,
  antipattern: 14,
  // invariant, anchor, character, world_rule → undefined = never decays
}

/** Minimum confidence value after decay. Items never fall below their floor. */
export const CONFIDENCE_FLOOR: Record<LearningType, number> = {
  invariant:   1.0,
  anchor:      1.0,
  character:   1.0,
  world_rule:  1.0,
  decision:    0.30,
  pattern:     0.15,
  voice:       0.15,
  plot_thread: 0.10,
  golden_path: 0.05,
  antipattern: 0.02,
  setting:     0.10,
}

/**
 * Compute the decayed confidence for a single learning.
 *
 * Called by the nightly decay tick for every non-pinned learning.
 * Result is written to the `confidence` column. `confidence_base` is never touched.
 *
 * Invariant: returned value ≤ confidenceBase (enforced by DB CHECK constraint).
 *
 * @param confidenceBase  The raw base score (written by Conductor on feedback)
 * @param type            Learning type (determines half-life and floor)
 * @param lastUsedAt      Last injection timestamp (resets the age clock)
 * @param createdAt       Creation timestamp (fallback reference date)
 * @param pinnedAt        If non-null: never decays, returns confidenceBase unchanged
 */
export function computeDecayedConfidence(
  confidenceBase: number,
  type:           LearningType,
  lastUsedAt:     Date | null,
  createdAt:      Date,
  pinnedAt:       Date | null,
): number {
  if (pinnedAt) return confidenceBase                    // pinned = immortal

  const halfLife = HALF_LIFE_DAYS[type]
  if (halfLife === undefined) return confidenceBase      // invariant/anchor/etc = immortal

  const referenceDate = lastUsedAt ?? createdAt
  const ageDays       = (Date.now() - referenceDate.getTime()) / 86_400_000
  const decayed       = confidenceBase * Math.pow(0.5, ageDays / halfLife)
  const floor         = CONFIDENCE_FLOOR[type] ?? 0.0

  return Math.max(decayed, floor)
}
```

---

### 4.2 `src/lib/core/conductor/guardrails.ts`

Invariant enforcement. Every confidence write must pass through these checks.

```typescript
// src/lib/core/conductor/guardrails.ts
// Guardrails — inviolable rules enforced before any Conductor action.
// These are not configuration. Do not add bypass flags.

import type { Learning } from '@/lib/nebula/types'
import { NebulaError } from '@/lib/nebula'

export const LARGE_DELTA_THRESHOLD    = 0.10   // deltas above this MUST create a proposal
export const UNVERIFIED_CONFIDENCE_CAP = 0.70  // unverified items may never exceed this
export const PROMOTION_THRESHOLD       = 0.85  // for proposal type 'promote' suggestion

export interface GuardrailContext {
  learning:         Learning
  proposedDelta:    number       // the change to confidence_base being requested
  isVerified:       boolean      // user has explicitly verified this learning
  requiresApproval: boolean      // caller's intent
}

export interface GuardrailResult {
  allowed:          boolean
  mustCreateProposal: boolean    // true if delta is large but action is otherwise valid
  violationReason?: string
  clampedBase?:     number       // if the proposed new value would exceed ceiling
}

/**
 * Check a proposed confidence_base change against all guardrails.
 * Returns whether the change is allowed and whether it requires a proposal.
 *
 * Callers must:
 * 1. If result.allowed = false → reject the action entirely
 * 2. If result.mustCreateProposal = true → create a ConductorProposal; do NOT apply directly
 * 3. Apply result.clampedBase instead of the raw target value if present
 */
export function checkGuardrails(ctx: GuardrailContext): GuardrailResult {
  const { learning, proposedDelta, isVerified } = ctx

  // Guard 1: Cannot modify pinned items
  if (learning.pinnedAt !== null) {
    return {
      allowed: false,
      mustCreateProposal: false,
      violationReason: 'Learning is pinned — Conductor cannot adjust confidence',
    }
  }

  // Guard 2: Unverified items may not exceed 0.70
  const newBase = learning.confidenceBase + proposedDelta
  if (!isVerified && newBase > UNVERIFIED_CONFIDENCE_CAP) {
    // Allow, but clamp
    return {
      allowed: true,
      mustCreateProposal: Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD,
      clampedBase: UNVERIFIED_CONFIDENCE_CAP,
    }
  }

  // Guard 3: Cannot go below 0.0 or above 1.0
  if (newBase < 0 || newBase > 1.0) {
    return {
      allowed: true,
      mustCreateProposal: Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD,
      clampedBase: Math.max(0.0, Math.min(1.0, newBase)),
    }
  }

  // Guard 4: Large deltas always require a proposal (even if otherwise valid)
  if (Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD) {
    return {
      allowed: true,
      mustCreateProposal: true,
    }
  }

  return { allowed: true, mustCreateProposal: false }
}

/**
 * Guard for deletion attempts. The Conductor cannot hard-delete.
 * Throws NebulaError if attempted.
 */
export function assertNoDelete(action: string): void {
  if (action === 'delete') {
    throw new NebulaError('INVALID_INPUT', 'Conductor cannot delete learnings — propose archive instead')
  }
}
```

---

### 4.3 `src/lib/core/conductor/confidence.ts`

Confidence formula and bounded application of explicit signals.

```typescript
// src/lib/core/conductor/confidence.ts
// Confidence_base calculation and explicit signal application.
// ONLY explicit signals are applied here. Heuristic/inaction signals are stored only.

import type { Learning } from '@/lib/nebula/types'
import { checkGuardrails, UNVERIFIED_CONFIDENCE_CAP } from './guardrails'

// Default deltas for explicit signals
export const EXPLICIT_POSITIVE_DELTA = +0.15
export const EXPLICIT_NEGATIVE_DELTA = -0.20

/**
 * Calculate a new confidence_base value after an explicit positive or negative signal.
 *
 * Returns the new confidence_base value (clamped, guardrail-checked).
 * Does NOT write to the database — caller does the write.
 *
 * Returns null if guardrails prohibit the change (pinned item).
 */
export function applyExplicitSignal(
  learning:    Learning,
  signal:      'positive' | 'negative',
  isVerified:  boolean = false,
): { newBase: number; mustPropose: boolean } | null {
  const delta = signal === 'positive' ? EXPLICIT_POSITIVE_DELTA : EXPLICIT_NEGATIVE_DELTA

  const result = checkGuardrails({
    learning,
    proposedDelta:    delta,
    isVerified,
    requiresApproval: false,
  })

  if (!result.allowed) return null

  const newBase = result.clampedBase ?? Math.max(0, Math.min(1, learning.confidenceBase + delta))

  return { newBase, mustPropose: result.mustCreateProposal }
}

/**
 * Full confidence_base formula.
 * Used when recalculating from scratch (e.g., after importing from v1).
 *
 * Parameters:
 * - interaction:       signal frequency and strength (0–1)
 * - verification:      1.0 if human-verified, 0.5 if not
 * - consistency:       stability across multiple feedback signals (0–1)
 * - consistencyFactor: how consistently this item holds up across feedback history (0–1)
 *                      ⚠️ NOT the time-based decay from decay.ts
 */
export function calculateConfidenceBase(
  interaction:       number,
  verification:      number,
  consistency:       number,
  consistencyFactor: number,
  isVerified:        boolean,
): number {
  const raw =
    interaction       * 0.3 +
    verification      * 0.4 +
    consistency       * 0.2 +
    consistencyFactor * 0.1

  const ceiling = isVerified ? 1.0 : UNVERIFIED_CONFIDENCE_CAP
  return Math.max(0, Math.min(ceiling, raw))
}
```

---

### 4.4 `src/lib/core/conductor/signals.ts`

Signal ingestion and routing. This is the canonical implementation of the v2.0 signal policy.

```typescript
// src/lib/core/conductor/signals.ts
// Signal ingestion and routing — the v2.0 canonical signal policy.
//
// POLICY (inviolable in v2.0):
//   explicit      → applied immediately to confidence_base + stored in feedback
//   heuristic     → stored in feedback table ONLY; no confidence_base change
//   inaction      → stored in feedback table ONLY; no confidence_base change
//   end_of_session_judge → creates a ConductorProposal; never auto-applies

import type { NebulaInterface } from '@/lib/nebula'
import type { ConductorSignal } from '../interface'
import { applyExplicitSignal } from './confidence'
import { assertNoDelete } from './guardrails'

export class SignalProcessor {
  constructor(private nebula: NebulaInterface) {}

  async process(signal: ConductorSignal): Promise<void> {
    // Record every signal in the feedback table first — audit trail is never optional
    await this.nebula.recordFeedback({
      userId:          undefined as unknown as string,  // resolved below — see note
      learningId:      signal.learningId,
      conversationId:  signal.conversationId,
      injectionId:     signal.injectionId,
      signal:          signal.signal as 'positive' | 'negative' | 'none',
      source:          signal.type === 'explicit' ? 'explicit'
                     : signal.type === 'heuristic' ? 'heuristic'
                     : signal.type === 'inaction' ? 'inaction'
                     : 'llm_judge',
    })

    // Route by signal type
    switch (signal.type) {
      case 'explicit':
        await this._processExplicit(signal)
        break

      case 'heuristic':
        // v2.0: stored only. No confidence_base change. Fall through.
        break

      case 'inaction':
        // v2.0: stored only. No confidence_base nudge. Fall through.
        break

      case 'end_of_session_judge':
        // Creates a proposal; never auto-applies.
        await this._processJudgeSignal(signal)
        break
    }
  }

  private async _processExplicit(signal: ConductorSignal): Promise<void> {
    if (signal.signal === 'none') return  // no-op for 'none' explicit

    const learning = await this.nebula.getLearning(signal.learningId)
    if (!learning) return  // learning deleted since injection

    const result = applyExplicitSignal(learning, signal.signal as 'positive' | 'negative')
    if (!result) return  // guardrails blocked (pinned item)

    if (result.mustPropose) {
      // Large delta — do not apply directly; create a proposal for user review
      await this._createProposal(signal, result.newBase - learning.confidenceBase, 'explicit signal exceeds large-delta threshold')
      return
    }

    // Small delta — apply immediately
    await this.nebula.updateLearning(learning.id, {
      confidenceBase: result.newBase,
      confidence:     result.newBase,   // confidence ≤ confidence_base; set equal until next decay tick
    })
  }

  private async _processJudgeSignal(signal: ConductorSignal): Promise<void> {
    // Judge signals always create proposals — never auto-apply
    const delta = signal.signal === 'positive' ? 0.05 : signal.signal === 'negative' ? -0.07 : 0
    if (delta === 0) return
    await this._createProposal(signal, delta, 'end-of-session LLM judge verdict')
  }

  private async _createProposal(
    signal:    ConductorSignal,
    delta:     number,
    rationale: string,
  ): Promise<void> {
    // Proposals are written to conductor_proposals via a queue item
    // Phase 3 will add the full proposal management UI; for Phase 2, write directly
    // NOTE: direct DB write to conductor_proposals bypasses the queue for proposals from signals.
    // Full queue-based proposal management is Phase 3.
    // For now, signal → proposal is direct.
    // (See proposals.ts for the full implementation.)
  }
}

// Note on userId in recordFeedback:
// ConductorSignal does not carry userId — it is linked via learningId + injectionId.
// In Phase 2, resolve userId from the learning record before calling recordFeedback.
// This is fixed in Phase 3 when the full signal processing pipeline is wired.
```

---

### 4.5 `src/lib/core/conductor/heuristics.ts`

Turn-pattern analysis that produces heuristic signals. v2.0: these are stored only.

```typescript
// src/lib/core/conductor/heuristics.ts
// Turn-pattern analysis for heuristic signal detection.
// v2.0: signals produced here are STORED ONLY — no confidence_base change.
// Full auto-application deferred to v2.1 after offline calibration.

export interface TurnContext {
  injectedLearningIds: string[]
  userMessage:         string
  assistantResponse:   string
  turnIndex:           number    // position in conversation (0-indexed)
}

export interface HeuristicSignal {
  learningId: string
  signal:     'positive' | 'negative'
  strength:   number    // 0–1 (soft prior weight; unused in v2.0)
  reason:     string
}

// Affirmation patterns that suggest the injected context was useful
const POSITIVE_PATTERNS = [
  /\b(perfect|that('s| is) (right|correct|it)|thanks?|great|exactly|yes|worked)\b/i,
  /\b(that helps?|got it|makes sense|exactly what i needed)\b/i,
]

// Rephrase patterns that suggest the injected context was unhelpful or misunderstood
const NEGATIVE_PATTERNS = [
  /\b(that('s| is)n't|not quite|no|wrong|that doesn't|try again|actually)\b/i,
  /\b(i meant|let me rephrase|what i (meant|asked|wanted))\b/i,
]

/**
 * Analyze a conversation turn and produce heuristic signals.
 *
 * v2.0: return signals are stored in feedback table with source = 'heuristic'.
 * No automatic confidence_base change is applied until v2.1 calibration.
 */
export function detectHeuristicSignals(ctx: TurnContext): HeuristicSignal[] {
  const signals: HeuristicSignal[] = []
  const msg = ctx.userMessage.toLowerCase()

  const isPositive = POSITIVE_PATTERNS.some((p) => p.test(msg))
  const isNegative = NEGATIVE_PATTERNS.some((p) => p.test(msg))

  if (!isPositive && !isNegative) return signals

  // Distribute signal to all injected learnings in this turn
  // (we don't yet know which specific item was relevant — Phase 3 attribution)
  for (const id of ctx.injectedLearningIds) {
    if (isPositive) {
      signals.push({ learningId: id, signal: 'positive', strength: 0.3, reason: 'user affirmation pattern' })
    } else if (isNegative) {
      signals.push({ learningId: id, signal: 'negative', strength: 0.2, reason: 'user rephrase/correction pattern' })
    }
  }

  return signals
}
```

---

### 4.6 `src/lib/core/conductor/proposals.ts`

Proposal creation, retrieval, and approval/rejection.

```typescript
// src/lib/core/conductor/proposals.ts
import { db } from '@/db'
import { conductorProposals, learnings } from '@/db/schema'
import { eq, and, lt } from 'drizzle-orm'
import type { ConductorProposal, ProposalType } from '../interface'
import { checkGuardrails } from './guardrails'
import type { NebulaInterface } from '@/lib/nebula'

const DEFAULT_EXPIRY_DAYS = 7

function rowToProposal(row: typeof conductorProposals.$inferSelect): ConductorProposal {
  return {
    id:                    row.id,
    type:                  row.type as ProposalType,
    targetLearningId:      row.learningId ?? '',
    confidenceDelta:       row.confidenceDelta,
    rationale:             row.rationale,
    requiresHumanApproval: row.requiresApproval,
    expiresAt:             row.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000),
    createdAt:             row.createdAt,
  }
}

export async function createProposal(
  userId:      string,
  learningId:  string,
  type:        ProposalType,
  delta:       number,
  rationale:   string,
): Promise<ConductorProposal> {
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000)
  const [row] = await db
    .insert(conductorProposals)
    .values({
      userId,
      learningId,
      type,
      confidenceDelta:  delta,
      rationale,
      requiresApproval: true,
      status:           'pending',
      expiresAt,
    })
    .returning()

  return rowToProposal(row)
}

export async function getProposals(userId: string): Promise<ConductorProposal[]> {
  const now  = new Date()
  const rows = await db
    .select()
    .from(conductorProposals)
    .where(
      and(
        eq(conductorProposals.userId, userId),
        eq(conductorProposals.status, 'pending'),
      )
    )

  // Filter expired proposals in memory (could also add WHERE expires_at > now)
  return rows
    .filter((r) => !r.expiresAt || r.expiresAt > now)
    .map(rowToProposal)
}

export async function approveProposal(
  proposalId: string,
  userId:     string,
  nebula:     NebulaInterface,
): Promise<void> {
  const [row] = await db
    .select()
    .from(conductorProposals)
    .where(and(eq(conductorProposals.id, proposalId), eq(conductorProposals.userId, userId)))

  if (!row || row.status !== 'pending') return

  const learning = row.learningId ? await nebula.getLearning(row.learningId) : null
  if (learning) {
    // Apply the confidence delta, respecting guardrails
    const result = checkGuardrails({
      learning,
      proposedDelta:    row.confidenceDelta,
      isVerified:       true,    // human approved = verified
      requiresApproval: false,
    })
    if (result.allowed) {
      const newBase = result.clampedBase ?? Math.max(0, Math.min(1, learning.confidenceBase + row.confidenceDelta))
      await nebula.updateLearning(learning.id, {
        confidenceBase: newBase,
        confidence:     newBase,
      })
    }
  }

  await db
    .update(conductorProposals)
    .set({ status: 'approved' })
    .where(eq(conductorProposals.id, proposalId))
}

export async function rejectProposal(proposalId: string, userId: string): Promise<void> {
  await db
    .update(conductorProposals)
    .set({ status: 'rejected' })
    .where(and(eq(conductorProposals.id, proposalId), eq(conductorProposals.userId, userId)))
}
```

---

### 4.7 `src/lib/core/conductor/queue.ts`

Queue management and zombie recovery.

```typescript
// src/lib/core/conductor/queue.ts
// Conductor queue and zombie recovery.
// CRITICAL: zombie recovery must be scheduled — serverless timeouts leave items stuck.

import { db } from '@/db'
import { conductorQueue } from '@/db/schema'
import { eq, and, lt, sql } from 'drizzle-orm'

export type QueueJobType = 'signal_processing' | 'lm_judge' | 'compaction'

export async function enqueue(
  userId:  string,
  type:    QueueJobType,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(conductorQueue).values({ userId, type, payload, status: 'pending' })
}

export async function claimNext(userId: string): Promise<typeof conductorQueue.$inferSelect | null> {
  // Claim the next pending item for this user (lock it)
  const [row] = await db
    .update(conductorQueue)
    .set({ status: 'processing', lockedAt: new Date() })
    .where(
      and(
        eq(conductorQueue.userId, userId),
        eq(conductorQueue.status, 'pending'),
      )
    )
    .returning()

  return row ?? null
}

export async function markComplete(id: string): Promise<void> {
  await db.update(conductorQueue).set({ status: 'completed' }).where(eq(conductorQueue.id, id))
}

export async function markFailed(id: string): Promise<void> {
  await db
    .update(conductorQueue)
    .set({ status: 'failed', attempts: sql`${conductorQueue.attempts} + 1` })
    .where(eq(conductorQueue.id, id))
}

/**
 * Zombie recovery — resets items stuck in 'processing' for > 10 minutes.
 * Run every 5 minutes via /api/cron/zombie-recovery.
 *
 * This is NON-NEGOTIABLE. Serverless functions time out. Without this,
 * items that were locked by a timed-out function stay stuck forever.
 *
 * Returns the count of recovered zombies (useful for monitoring).
 */
export async function recoverZombies(): Promise<number> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000)

  const result = await db
    .update(conductorQueue)
    .set({
      status:   'pending',
      lockedAt: null,
      attempts: sql`${conductorQueue.attempts} + 1`,
    })
    .where(
      and(
        eq(conductorQueue.status, 'processing'),
        lt(conductorQueue.lockedAt, threshold),
      )
    )
    .returning()

  return result.length
}
```

---

### 4.8 `src/lib/core/conductor/judge.ts`

End-of-session LLM judge. Disabled by default. Stub in Phase 2; full implementation in Phase 3.

```typescript
// src/lib/core/conductor/judge.ts
// End-of-session LLM judge — async, post-conversation, opt-in only.
//
// v2.0: disabled by default (endOfSessionJudgeEnabled = FALSE).
// This file exists as a contract stub. Full implementation in Phase 3.
// Sovereign/local tier users: judge is NEVER enabled regardless of user setting.

import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function isJudgeEnabled(userId: string): Promise<boolean> {
  const row = await db.query.userSettings?.findFirst({ where: eq(userSettings.id, userId) })
  return row?.endOfSessionJudgeEnabled ?? false
}

/**
 * Fire the end-of-session judge if the user has opted in.
 * In Phase 2: always returns without doing anything (feature not yet implemented).
 * In Phase 3: will call the cheapest available provider the user has authorized.
 *
 * NEVER auto-applies results. Judge verdicts always create proposals with requiresHumanApproval = true.
 */
export async function maybeFireSessionJudge(
  userId:          string,
  conversationId:  string,
  injectedIds:     string[],
): Promise<void> {
  const enabled = await isJudgeEnabled(userId)
  if (!enabled) return

  // Phase 3 TODO: implement judge call
  // 1. Build conversation summary from conversation history
  // 2. Call cheapest available provider (already authorized by user)
  // 3. Parse verdict → create ConductorProposals with requiresHumanApproval = true
  // 4. Never auto-apply
}
```

---

### 4.9 `src/lib/core/conductor/conductor.ts`

ConductorImpl — wires signals, proposals, queue, and the BinaryStarInterface's Conductor methods.

```typescript
// src/lib/core/conductor/conductor.ts
import type { NebulaInterface } from '@/lib/nebula'
import type { ConductorSignal, ConductorProposal } from '../interface'
import { SignalProcessor } from './signals'
import { getProposals, approveProposal, rejectProposal } from './proposals'

export class ConductorImpl {
  private signalProcessor: SignalProcessor

  constructor(private nebula: NebulaInterface) {
    this.signalProcessor = new SignalProcessor(nebula)
  }

  async submitSignal(signal: ConductorSignal): Promise<void> {
    try {
      await this.signalProcessor.process(signal)
    } catch (err) {
      // Signal processing failures are logged and swallowed — one bad signal must not
      // block the response pipeline. See CONDUCTOR_INTERFACE_SPEC.md § Error Handling.
      console.error('[Conductor] Signal processing error:', err)
    }
  }

  async getProposals(userId: string): Promise<ConductorProposal[]> {
    return getProposals(userId)
  }

  async approveProposal(proposalId: string, userId: string): Promise<void> {
    return approveProposal(proposalId, userId, this.nebula)
  }

  async rejectProposal(proposalId: string, userId: string): Promise<void> {
    return rejectProposal(proposalId, userId)
  }
}

export function createConductor(nebula: NebulaInterface): ConductorImpl {
  return new ConductorImpl(nebula)
}
```

---

### 4.10 `src/lib/core/conductor/index.ts`

```typescript
// src/lib/core/conductor/index.ts
export { createConductor, ConductorImpl } from './conductor'
export { recoverZombies } from './queue'
export { computeDecayedConfidence, HALF_LIFE_DAYS, CONFIDENCE_FLOOR } from './decay'
```

---

## Step 5: Binary Star Wiring

### 5.1 `src/lib/core/impl.ts`

```typescript
// src/lib/core/impl.ts
// BinaryStar: wires Podium + Conductor into BinaryStarInterface.
// Layer 2 imports createBinaryStar() only.

import type { NebulaInterface } from '@/lib/nebula'
import type { BinaryStarInterface, PodiumRequest, PodiumResult,
  ConductorSignal, ConductorProposal } from './interface'
import { createPodium } from './podium'
import { createConductor } from './conductor'

class BinaryStarImpl implements BinaryStarInterface {
  private podium
  private conductor

  constructor(nebula: NebulaInterface) {
    this.podium    = createPodium(nebula)
    this.conductor = createConductor(nebula)
  }

  async getContext(request: PodiumRequest): Promise<PodiumResult> {
    return this.podium.getContext(request)
  }

  async submitSignal(signal: ConductorSignal): Promise<void> {
    return this.conductor.submitSignal(signal)
  }

  async getProposals(userId: string): Promise<ConductorProposal[]> {
    return this.conductor.getProposals(userId)
  }

  async approveProposal(proposalId: string, userId: string): Promise<void> {
    return this.conductor.approveProposal(proposalId, userId)
  }

  async rejectProposal(proposalId: string, userId: string): Promise<void> {
    return this.conductor.rejectProposal(proposalId, userId)
  }
}

let _binaryStar: BinaryStarInterface | null = null

export function createBinaryStar(nebula: NebulaInterface): BinaryStarInterface {
  if (!_binaryStar) {
    _binaryStar = new BinaryStarImpl(nebula)
  }
  return _binaryStar
}
```

### 5.2 `src/lib/core/index.ts`

```typescript
// src/lib/core/index.ts
// Layer 1 — Binary Star Core public surface
// Layer 2 imports BinaryStarInterface and createBinaryStar only.

export type { BinaryStarInterface, PodiumRequest, PodiumResult, InjectedLearning,
  ConductorSignal, ConductorProposal, DomainSignal, QueryIntent,
  QueryComplexity, ProposalType, ConductorSignalType } from './interface'
export { createBinaryStar } from './impl'
```

---

## Step 6: Cron Routes (Layer 4 Shell — headless endpoints)

These are API routes that call Layer 1 functions. They live in `src/app/api/` (Layer 4 / Shell). Shell may call any layer via its published interface.

### 6.1 `src/app/api/cron/decay/route.ts`

```typescript
// src/app/api/cron/decay/route.ts
// Nightly decay tick — Vercel Cron at 2AM UTC.
// Reads all non-pinned learnings and applies computeDecayedConfidence() to each.
// Writes the updated `confidence` column. Never touches `confidence_base`.

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { learnings } from '@/db/schema'
import { isNull, ne } from 'drizzle-orm'
import { computeDecayedConfidence } from '@/lib/core/conductor/decay'
import type { LearningType } from '@/lib/nebula/types'

// Vercel Cron secret — set CRON_SECRET in .env.local for production
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  // Verify cron auth in production
  if (CRON_SECRET) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Process in batches to avoid memory pressure on large graphs
    const BATCH_SIZE = 500
    let offset  = 0
    let updated = 0

    while (true) {
      const batch = await db
        .select()
        .from(learnings)
        .where(isNull(learnings.pinnedAt))   // pinned items never decay
        .limit(BATCH_SIZE)
        .offset(offset)

      if (batch.length === 0) break

      for (const row of batch) {
        const newConfidence = computeDecayedConfidence(
          row.confidenceBase,
          row.type as LearningType,
          row.lastUsedAt,
          row.createdAt,
          row.pinnedAt,
        )

        // Only write if the value changed (avoid unnecessary writes)
        if (Math.abs(newConfidence - row.confidence) > 0.001) {
          await db
            .update(learnings)
            .set({ confidence: newConfidence })
            .where(ne(learnings.id, row.id))   // NOTE: use eq(learnings.id, row.id)
          updated++
        }
      }

      if (batch.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }

    return NextResponse.json({ updated, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[decay-cron] Error:', err)
    return NextResponse.json({ error: 'Decay tick failed' }, { status: 500 })
  }
}
```

> **CRITICAL FIX for Codex:** The WHERE clause in the UPDATE above has a bug (`ne` should be `eq`). Replace:
> ```typescript
> .where(ne(learnings.id, row.id))
> ```
> with:
> ```typescript
> .where(eq(learnings.id, row.id))
> ```
> The spec uses `ne` as a placeholder but the correct operator is `eq`. Codex must fix this.

### 6.2 `src/app/api/cron/zombie-recovery/route.ts`

```typescript
// src/app/api/cron/zombie-recovery/route.ts
// Queue zombie recovery — Vercel Cron every 5 minutes.
// Resets conductor_queue items stuck in 'processing' for > 10 minutes.

import { NextResponse } from 'next/server'
import { recoverZombies } from '@/lib/core/conductor/queue'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const recovered = await recoverZombies()
    return NextResponse.json({ recovered, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[zombie-recovery] Error:', err)
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 })
  }
}
```

### 6.3 `vercel.json` (create at repo root if not present)

```json
{
  "crons": [
    {
      "path": "/api/cron/decay",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/zombie-recovery",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## Step 7: Build Verification

```bash
npx next build
```

Expected: exit 0, zero TypeScript errors.

Common issues to resolve:
- `db.query.userSettings` — Drizzle relational query API requires schema relations to be declared. If `findFirst` fails, use `db.select().from(userSettings).where(eq(userSettings.id, userId))` instead.
- `conductorQueue.lockedAt` in zombie recovery `lt()` call — lockedAt is `TIMESTAMPTZ | null`; wrap with `isNotNull(conductorQueue.lockedAt)` AND clause to avoid comparing null timestamps.
- `decay/route.ts`: the `ne` → `eq` fix (see Step 6.1 CRITICAL FIX note above).
- Unused `.gitkeep` files in conductor/podium subdirectories — leave them; they don't affect compilation.
- `import { eq } from 'drizzle-orm'` — verify all drizzle operator imports are from `drizzle-orm` not `drizzle-orm/pg-core`.

---

## Step 8: Guardian Validation

Run in order. All must pass before Phase 3 begins.

### 8.1 chorum-layer-guardian

Load `skills/chorum-layer-guardian/SKILL.md`. Audit all new files in `src/lib/core/`.

**Expected:** No imports from `@/lib/customization`, `@/lib/agents`, or `@/app` in any core file. No cross-imports between podium/ and conductor/ subdirectories.

### 8.2 podium-injection-agent

Load `skills/podium-injection-agent/SKILL.md` and run all 5 checks.

| Check | Expected |
|-------|----------|
| 1. Tiering | `selectTier` and `computeEffectiveBudget` produce correct budgets |
| 2. Attention Economy | Selection sorts by `score / tokenCount`; quality threshold enforced |
| 3. Domain Awareness | `DomainSignal.primary` is `string \| null`; no `'general'` string anywhere; null path scores all types with weight 1.0 |
| 4. Embedding | `searchByEmbedding` is called with the correct `dims` inferred from embedding vector length |
| 5. Audit Trail | Every candidate (included AND excluded) appears in `auditEntries` |

### 8.3 conductor-spec-agent

Load `skills/conductor-spec-agent/SKILL.md` and run all 4 checks.

| Check | Expected |
|-------|----------|
| 1. Invariants | `assertNoDelete` throws; pinned check in guardrails; delta > 0.10 creates proposal |
| 2. Signal Handling | explicit → `confidence_base` update; heuristic/inaction → stored only; judge → proposal |
| 3. Queue | `recoverZombies()` implemented; threshold 10 min; scheduled via cron |
| 4. Feedback Loop | `injectionId` links `injection_audit.id` to `ConductorSignal.injectionId` |

---

## Completion Criteria

Map to `CHECKLIST_2.0.md` Phase 2 → Phase 3 Transition:

| Checklist Item | How to verify |
|----------------|---------------|
| Podium interface implemented per spec | `getContext()` returns `PodiumResult` with correct shape |
| Conductor interface implemented per spec | `submitSignal()`, `getProposals()`, `approveProposal()`, `rejectProposal()` all work |
| Tiered compilation correct (Tier 1/2/3 selection) | `computeEffectiveBudget(16000)` → tier 1; `computeEffectiveBudget(32000)` → tier 2 |
| Budget clamping in ALL code paths | `computeEffectiveBudget(16000, 10000)` → 960 (not 10000) |
| Confidence formula matches spec exactly | `calculateConfidenceBase(...)` uses 0.3/0.4/0.2/0.1 weights |
| Zombie recovery implemented and tested | Insert `status='processing'`, `locked_at=15min ago` → `recoverZombies()` resets it to `pending` |
| Guardrails enforced | `checkGuardrails({ pinnedAt: now() })` → `allowed: false` |
| Injection audit log populated on every injection | `auditEntries.length === candidates.length` |
| podium-injection-agent passes | All 5 checks PASS |
| conductor-spec-agent passes | All 4 checks PASS |
| Binary Star can run headless | `createBinaryStar(nebula).getContext(req)` works without UI |

---

## Changelog Entry

Add to `CHANGELOG.md` under `[2.0.0-alpha.2]`:

```markdown
## [2.0.0-alpha.2] — Phase 2: Binary Star Core (Layer 1)

### Added
- Podium: tiered context injection with intent-adaptive weight profiles (7 intents)
- Podium: attention density selection (score / tokenCount) over token maximization
- Podium: domain-aware type weights (coding, writing, trading, research; null = all-equal)
- Podium: Tier 1/2 pre-compiled in-memory cache (TTL-based)
- Podium: full injection audit trail (included AND excluded candidates logged)
- Conductor: explicit signal auto-application to confidence_base
- Conductor: heuristic + inaction signals stored-only (no auto-confidence change — v2.0 policy)
- Conductor: end-of-session judge stub (disabled by default; endOfSessionJudgeEnabled = false)
- Conductor: ConductorProposals for large deltas (> 0.10) and judge verdicts
- Conductor: guardrails (no delete, no unverified > 0.7, no pinned override)
- Conductor: zombie recovery (resets queue items stuck > 10 min; 5-min cron schedule)
- decay.ts: computeDecayedConfidence() — nightly tick, single source of truth
- Migration 0002_user_settings.sql — user_settings table (endOfSessionJudgeEnabled)
- Cron routes: /api/cron/decay (nightly 2AM), /api/cron/zombie-recovery (every 5 min)

### Fixed
- NebulaInterface extended: incrementUsageCount(ids) — atomic fire-and-forget
- Phase 1 usageCount increment pattern corrected (atomic SQL, not read-modify-write)

### Architecture
- No imports between podium/ and conductor/ — they share NebulaInterface only
- BinaryStarInterface is the single export from src/lib/core/ for Layer 2
```

---

## Codex Notes

**Signal policy — do not collapse:** The four signal types (explicit, heuristic, inaction, end_of_session_judge) must have distinct code paths in `signals.ts`. Do not route them through a shared handler with a switch fallthrough.

**Do not enable the judge by default:** `userSettings.endOfSessionJudgeEnabled` defaults to `false`. The `isJudgeEnabled()` check is non-negotiable — do not skip it.

**Budget clamping — always call `computeEffectiveBudget`:** Do not inline budget math. Every code path that needs a token budget must call `computeEffectiveBudget(contextWindowSize)`. This is how the v1 cache-miss bug is prevented.

**Decay route bug:** The `decay/route.ts` scaffold in Step 6.1 has a deliberate bug marker (`ne` vs `eq`). Fix it before the file is committed. Use `eq(learnings.id, row.id)` in the WHERE clause of the UPDATE.

**`DomainSignal.primary` is `string | null`:** There is no `'general'` string in the type union. If you find yourself writing `case 'general':` anywhere in the codebase, delete it.

**Gemini 3.1 handoff:** Phase 2a (scorer.ts, tiers.ts, compiler.ts) is assigned to Gemini 3.1 for the scoring math. Phase 2b (conductor/) is assigned to Codex 5.3. After Gemini generates scorer.ts, run `podium-injection-agent` on it before Codex touches conductor/.

**Recommended model for Phase 3:** Codex 5.3 for MCP endpoint wiring and ChorumClient adapter. Phase 3 is primarily interface implementation and transport code — Codex's strength.
