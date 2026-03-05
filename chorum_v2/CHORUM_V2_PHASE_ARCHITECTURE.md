# Chorum 2.0 — Phase Architecture Master Plan

## Context

Chorum 1.0 was built feature-first: routing, then memory, then conductor controls — each bolted on. The result was business logic in API routes, a memory model tied to projects, and a feedback loop that was never truly closed. v2 inverts this. The knowledge graph is the product. Everything else orbits it.

This document defines the **build order and architecture contract** for a clean-room implementation in `ChorumAI/chorum-v2/`. No migration compatibility. No v1 history. The 5 guardian skills in `tools/skills/` enforce correctness at every phase boundary.

**Canonical decisions:**
- Location: `C:\Users\dmill\Documents\GitHub\ChorumAI\chorum-v2\`
- Framework: Next.js App Router, TypeScript strict, Drizzle ORM
- Database: Supabase (PostgreSQL + pgvector)
- Embedding dimensions: **1536** (OpenAI `text-embedding-3-small`)
- MCP: Primary interface — `chorumd` daemon model
- Layer contracts: enforced before code, not after

---

## Build Order — 6 Phases

Each phase produces: **(1) an architecture spec, (2) implementation, (3) guardian validation**. No implementation begins without an approved spec.

```
Phase 0: Foundation          → Scaffold + pre-implementation specs
Phase 1: Nebula (Layer 0)    → Zettelkasten schema, CRUD, graph queries
Phase 2: Binary Star Core    → Podium (Layer 1a) + Conductor (Layer 1b)
Phase 3: Customization       → Domain seeds, decay config, MCP surface (Layer 2)
Phase 4: Agent Layer         → Personas, routing, tool access (Layer 3)
Phase 5: Shell Layer         → Chat UI, CLI, settings — stateless (Layer 4)
```

UI is **Phase 5 only**. Everything before it is headless and MCP-accessible.

---

## Phase 0 — Foundation

### Goal
Working Next.js scaffold with database connection, Drizzle, auth, and the first five pre-implementation spec documents committed. No application logic yet.

### Deliverables

**Project scaffold** at `chorum-v2/`:
```
chorum-v2/
  src/
    db/
      schema.ts          ← empty, migration 0001 pending
      index.ts           ← Drizzle client
    lib/
      nebula/            ← Layer 0 (populated in Phase 1)
      core/              ← Layer 1 — Binary Star (Phase 2)
      customization/     ← Layer 2 (Phase 3)
      agents/            ← Layer 3 (Phase 4)
    app/
      api/
        mcp/             ← MCP endpoint skeleton (elevated in Phase 3)
  docs/
    specs/
      LAYER_CONTRACTS.md
      NEBULA_SCHEMA_SPEC.md
      PODIUM_INTERFACE_SPEC.md
      CONDUCTOR_INTERFACE_SPEC.md
      DOMAIN_SEEDS_SPEC.md
  tools/ → symlink or copy of ../tools/skills/
  drizzle/
  drizzle.config.ts
  .env.local
```

**Pre-implementation specs** (written before any DB migration):
1. `LAYER_CONTRACTS.md` — TypeScript interfaces for every layer boundary; import direction rules
2. `NEBULA_SCHEMA_SPEC.md` — Full DDL with federation columns, indexes, pgvector config
3. `PODIUM_INTERFACE_SPEC.md` — `PodiumRequest`, `PodiumResult`, tier thresholds, scoring weights
4. `CONDUCTOR_INTERFACE_SPEC.md` — `ConductorSignal`, `ConductorProposal`, guardrails, queue contract
5. `DOMAIN_SEEDS_SPEC.md` — initial `domain_seeds` entries for known domains (coding/writing/trading), how the analyzer produces scope tags from content, how `domain_clusters` recompute from tag co-occurrence. Explicitly forbids a "general" fallback category. New seeds are registered dynamically as the graph discovers new territory.

**Auth:** Supabase Auth wired via NextAuth. Same pattern as v1 (`auth()` → `session.user.id`).

**Guardian gate:** `chorum-layer-guardian` + `nebula-schema-guardian` run on Phase 0 scaffold before Phase 1 begins.

### What we borrow from v1
- Supabase Auth configuration pattern
- Drizzle config structure (reference only — fresh migration chain `0001_*`)
- Hygge Brutalist design tokens (copy to `src/styles/tokens.css` — unused until Phase 5)
- `src/lib/providers/` — copy verbatim; provider routing is not a v2 concern until Phase 4
- `src/lib/learning/queue.ts` zombie recovery pattern (reference for Phase 2 Conductor queue)

---

## Phase 1 — Nebula (Layer 0)

### Goal
The persistent substrate. A correct, federated, scope-tagged knowledge graph with embedding search. No business logic. Layer 0 knows nothing about Layer 1+.

### Schema (migration `0001_nebula_core.sql`)

**13 core tables:**

```sql
-- Core learning node — no embedding column; vectors live in separate typed tables
learnings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users,
  team_id       UUID,                          -- federation: nullable now, required in 3.0
  content       TEXT NOT NULL,
  type          TEXT NOT NULL,                 -- see type registry below
  confidence_base FLOAT NOT NULL DEFAULT 0.5, -- raw score set by Conductor; never decayed
  confidence    FLOAT NOT NULL DEFAULT 0.5,    -- effective value; updated nightly by decay tick
  extraction_method TEXT NOT NULL,             -- 'manual'|'auto'|'import'
  source_conversation_id UUID,
  pinned_at     TIMESTAMPTZ,                   -- Conductor cannot touch if non-null
  muted_at      TIMESTAMPTZ,                   -- Podium never injects if non-null
  usage_count   INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  promoted_at   TIMESTAMPTZ,                   -- usage_count >= 10 → guaranteed Tier 1/2
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Cloud embeddings — 1536-dim, ANN indexed, requires OpenAI/Google/Mistral
-- Sovereignty note: users in local-only mode never need this table populated
embeddings_1536 (
  learning_id   UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding     VECTOR(1536) NOT NULL,
  model_name    TEXT NOT NULL,                 -- 'text-embedding-3-small' | 'text-embedding-3-large'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Local embeddings — 384-dim, ANN indexed, producible by all-MiniLM-L6-v2 (ONNX/Ollama)
-- Sovereignty guarantee: full semantic search without any cloud dependency
embeddings_384 (
  learning_id   UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding     VECTOR(384) NOT NULL,
  model_name    TEXT NOT NULL,                 -- 'all-MiniLM-L6-v2' | 'nomic-embed-text-v1.5'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Scope tags (many-to-many, replaces project ownership)
learning_scopes (
  learning_id   UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  scope         TEXT NOT NULL,                 -- '#python', '#trading', '#fiction'
  PRIMARY KEY (learning_id, scope)
)

-- Zettelkasten edges
learning_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  target_id     UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  link_type     TEXT NOT NULL,                 -- 'related'|'supports'|'contradicts'|'supersedes'
  strength      FLOAT NOT NULL DEFAULT 0.5,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Co-occurrence (usage cohort tracking)
cooccurrence (
  learning_a    UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  learning_b    UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  count         INTEGER NOT NULL DEFAULT 1,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learning_a, learning_b)
)

-- Feedback signals
feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users,
  learning_id   UUID REFERENCES learnings ON DELETE CASCADE,
  conversation_id UUID,
  signal        TEXT NOT NULL,                 -- 'positive'|'negative'|'none'
  source        TEXT NOT NULL,                 -- 'explicit'|'implicit'|'inaction'
  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Projects as saved scope filters (NOT containers)
projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users,
  team_id       UUID,
  name          TEXT NOT NULL,
  scope_filter  JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}',
  domain_cluster_id UUID REFERENCES domain_clusters, -- nullable; set when cluster is discovered
                                               -- never hard-assigned; computed from scope tag co-occurrence
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Domain seeds: type-weight hints for known domain signals (NOT a fixed enum)
-- These are LLM-readable defaults, overridden by learned behavior over time.
-- A domain is a label that EMERGES from scope tag clustering, not a pre-assigned category.
domain_seeds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL UNIQUE,          -- 'coding', 'writing', 'trading', etc.
                                               -- new seeds can be inserted dynamically as graph learns
  signal_keywords JSONB NOT NULL,              -- terms that suggest this domain is present
  preferred_types JSONB NOT NULL,              -- type→weight hints (starting point, not enforced)
  is_system     BOOLEAN NOT NULL DEFAULT FALSE -- TRUE = shipped with app; FALSE = learned/user-defined
)

-- Emergent domain clusters discovered from scope tag co-occurrence
domain_clusters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users,
  label         TEXT NOT NULL,                 -- system-assigned or user-renamed label
  scope_tags    JSONB NOT NULL,                -- ['#python', '#algorithms', '#performance']
  centroid_1536 VECTOR(1536),                  -- cloud centroid; NULL if user is local-only
  centroid_384  VECTOR(384),                   -- local centroid; NULL if no local model configured
  confidence    FLOAT NOT NULL DEFAULT 0.5,    -- how well-defined this cluster is
  learning_count INTEGER NOT NULL DEFAULT 0,
  last_recomputed TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- Podium injection audit — every decision logged (included AND excluded)
-- Written by Layer 1 (Podium) via NebulaInterface; table lives at Layer 0
injection_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users,
  conversation_id UUID,
  learning_id     UUID REFERENCES learnings ON DELETE SET NULL,
  included        BOOLEAN NOT NULL,
  score           FLOAT NOT NULL,
  reason          TEXT,                        -- why included (e.g. 'high semantic + scope match')
  exclude_reason  TEXT,                        -- why excluded (e.g. 'below threshold', 'muted')
  tier_used       INTEGER NOT NULL,            -- 1|2|3
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- MCP API tokens — hashed Bearer tokens for external client auth
api_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users,
  name            TEXT NOT NULL,               -- human label e.g. 'Cursor integration'
  hashed_token    TEXT NOT NULL UNIQUE,        -- bcrypt hash; plain token shown once at creation
  scopes          JSONB NOT NULL DEFAULT '[]', -- ['read:nebula', 'write:feedback', etc.]
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                 -- NULL = never expires
  revoked_at      TIMESTAMPTZ,                 -- soft revoke; NULL = active
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Type registry** (TEXT, never ENUM):
`invariant` | `pattern` | `decision` | `antipattern` | `golden_path` | `anchor`
`character` | `setting` | `plot_thread` | `voice` | `world_rule`

**Domain design principle:** Domain is emergent, not assigned. Scope tags (`#python`, `#trading`, `#worldbuilding`) are the atomic unit. Clusters form from scope tag co-occurrence within a user's graph. The analyzer produces scope tags — never a fixed domain label. `domain_seeds` provide LLM-readable extraction hints for known signal patterns; new seeds are added dynamically as the graph discovers new territory. There is no "general" fallback — if the domain is unclear, tag with the most specific terms available and let clustering reveal the pattern.

> **Accepted tradeoff:** Cold-start users with no scope tags yet receive no domain-match bonus during retrieval. This is intentional — pgvector semantic similarity still surfaces relevant items; the domain boost simply doesn't activate until scope tags accumulate from conversation and extraction. Retrieval degrades gracefully to embedding-only search, not to zero results. The absence of a "general" bucket prevents a catch-all that would dilute precise domain clusters once they form.

**Confidence columns** — both live in `learnings`:
- `confidence_base`: Conductor writes here. The raw assigned score. Never decayed.
- `confidence`: Podium reads this. Effective value after decay is applied. Updated by the decay tick.

Invariant: `confidence` ≤ `confidence_base`. Pinned items: Conductor skips them entirely.

**Embedding architecture — sovereignty-first:**

pgvector's ivfflat index requires uniform dimensions per column. Mixing dimensions corrupts cosine similarity. The fix is two separate typed tables with separate indexes, not a single locked column.

Podium query priority: `embeddings_1536` (best quality) → `embeddings_384` (good quality, no cloud) → scope/recency only (cold start or no embeddings yet). A user running fully local and sovereign gets full semantic search via `embeddings_384` — they never need a cloud provider.

**Indexes:**
```sql
-- learnings
CREATE INDEX ON learnings(user_id);
CREATE INDEX ON learnings(team_id);
CREATE INDEX ON learnings(confidence) WHERE confidence > 0.2;

-- embedding tables (separate ivfflat per dimension)
-- lists = 100 is correct for ~10K rows. IVFFlat rule of thumb: lists ≈ sqrt(N).
-- At ~1K rows lists = 32 is optimal; at ~100K rows lists = 316.
-- Migration path: add a periodic job (Phase 3+) that reindexes with updated lists when
-- learning count crosses thresholds: 1K→32, 10K→100, 100K→316.
-- Long-term (>500K rows per user): migrate to HNSW (pgvector 0.5+) via:
--   CREATE INDEX ON embeddings_1536 USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
-- HNSW migration is non-blocking (CREATE INDEX CONCURRENTLY) and improves recall@k significantly at scale.
CREATE INDEX ON embeddings_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON embeddings_384  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- scope + feedback
CREATE INDEX ON learning_scopes(scope);
CREATE INDEX ON learning_scopes(learning_id);
CREATE INDEX ON feedback(user_id, processed) WHERE processed = FALSE;

-- audit + auth
CREATE INDEX ON injection_audit(user_id, created_at DESC);
CREATE INDEX ON api_tokens(hashed_token) WHERE revoked_at IS NULL;
```

### Decay Mechanism

The v1 failure: decay was computed only at query time as a runtime multiplier. Stored `confidence` never changed — Conductor acted on stale values, notifications were impossible.

The prior plan put the decay formula inside Postgres SQL functions. That moves business logic into the database, breaks SQLite portability (required for future local-first / sovereignty mode), and makes the formula harder to test and version.

**v2 fix: TypeScript decay tick with pluggable scheduler.**

The decay formula lives in one TypeScript function:

```typescript
// src/lib/core/conductor/decay.ts
export function computeDecayedConfidence(
  confidenceBase: number,
  type: LearningType,
  lastUsedAt: Date | null,
  createdAt: Date,
  pinnedAt: Date | null
): number {
  if (pinnedAt) return confidenceBase        // pinned = no decay ever
  const halfLife = HALF_LIFE_DAYS[type]
  if (!halfLife) return confidenceBase       // invariants, anchors, etc.
  const ageDays = (Date.now() - (lastUsedAt ?? createdAt).getTime()) / 86_400_000
  const decayed = confidenceBase * Math.pow(0.5, ageDays / halfLife)
  return Math.max(decayed, CONFIDENCE_FLOOR[type])
}

export const HALF_LIFE_DAYS: Partial<Record<LearningType, number>> = {
  decision: 365, pattern: 90, golden_path: 30, antipattern: 14,
  setting: 180, plot_thread: 90, voice: 90,   // voice: 90 confirmed intentional (writing domain)
  // invariant, anchor, character, world_rule → undefined = no decay
}

export const CONFIDENCE_FLOOR: Record<LearningType, number> = {
  invariant: 1.0, anchor: 1.0, character: 1.0, world_rule: 1.0,
  decision: 0.30, pattern: 0.15, golden_path: 0.05, antipattern: 0.02,
  setting: 0.10, plot_thread: 0.10, voice: 0.15,
}
```

This function is the single source of truth. Any scheduler calls the same function:

| Trigger | When to use |
|---------|-------------|
| Vercel Cron (`/api/cron/decay`, nightly 2AM UTC) | Primary for Supabase/Vercel deployment |
| `pg_cron` calling `/api/cron/decay` via `pg_net` | Secondary if Vercel Cron isn't available |
| `chorumd` internal scheduler | Local installs, SQLite mode |

The database is a dumb storage layer. Scheduler fires the TypeScript function. The SQL issued is always a simple UPDATE — no stored procedures, no Postgres-specific functions.

Muted items DO decay — muting controls injection, not aging. Pinned items never decay (enforced in `computeDecayedConfidence`).

### Layer 0 Interface (what Layer 1 may call)

```typescript
// src/lib/nebula/interface.ts — the ONLY export Layer 1 may import
export interface NebulaInterface {
  // Node CRUD
  createLearning(input: CreateLearningInput): Promise<Learning>
  getLearning(id: string): Promise<Learning | null>
  updateLearning(id: string, patch: Partial<Learning>): Promise<Learning>
  deleteLearning(id: string): Promise<void>           // hard delete — requires explicit call

  // Scope queries
  getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]>
  // Searches best available embedding table: 1536 first, 384 fallback, scope/recency if neither.
  // Cross-lens access: by default, search is scoped to the calling project's ScopeFilter.
  // To retrieve learnings from other project lenses, the caller must pass allowCrossLens: true
  // AND the calling project must have crossLensAccess: true in its settings (default false).
  // Every cross-lens retrieval emits a log entry in injection_audit.reason = 'cross-lens'.
  // This prevents accidental context bleed between isolated projects (e.g., client A and client B).
  searchByEmbedding(embedding: number[], dims: 384 | 1536, scopeFilter: ScopeFilter, limit: number, allowCrossLens?: boolean): Promise<ScoredLearning[]>

  // Embedding management (separate tables)
  setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void>
  hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean>
  getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]>  // for retry queue

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

  // Injection audit (written by Podium, stored at Layer 0)
  logInjectionAudit(entries: InjectionAuditEntry[]): Promise<void>

  // API token auth (written by user settings, read by MCP layer)
  validateApiToken(hashedToken: string): Promise<ApiToken | null>
  createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }>
  revokeApiToken(id: string): Promise<void>
}
```

### Phase 1b — Write-Time Semantic Dedup

**Why here:** Dedup is a Nebula (Layer 0) concern — it's a write-path guard on `createLearning`, not a Podium or Conductor concern. Without it, every paraphrase of the same concept accumulates as a separate row, diluting injection quality and wasting budget. v1 data confirmed: 1,062 learnings with near-duplicate corpus bloat a documented failure mode.

**Algorithm:**
1. When `createLearning` is called, the embedding is computed first (already required by the interface contract)
2. Query the appropriate embedding table (`embeddings_1536` or `embeddings_384`) for the nearest neighbor of the same `type` for the same `user_id` using pgvector `<=>` operator
3. If nearest neighbor cosine similarity ≥ **0.85**: merge — update existing item's `content` to the new wording (newer phrasing drifts toward precision), update its embedding, increment `usage_count`, log the merge to `injection_audit` with `reason = 'dedup-merge'`
4. If < 0.85: create normally

**Constraint:** Same-type comparison only. A `pattern` and an `invariant` with similar content serve distinct cognitive purposes and must both be stored.

**Threshold:** 0.85 is conservative — catches clear paraphrases without false merges. Single named constant `DEDUP_THRESHOLD = 0.85` in `src/lib/nebula/dedup.ts`.

**Compaction (periodic, Phase 3):** Write-time dedup prevents new bloat. Existing corpus compaction — clustering by similarity and merging orphaned near-duplicates — is a Phase 3 background job to clean up v2's own accumulated data.

**File:**
```
src/lib/nebula/
  dedup.ts    ← findNearDuplicate(), mergeWithExisting() — called internally by createLearning()
```

**Guardian gate:** `nebula-schema-guardian` runs against migration `0001` before Phase 2 begins. Must pass all 5 checks: federation, ownership model, required fields, type safety, indexes. **Phase 1b adds check 6: dedup implemented in `createLearning` path.**

---

## Phase 2 — Binary Star Core (Layer 1)

### Goal
The gravitational center. Podium (scaffold) and Conductor (feedback) built as a single, co-dependent unit sharing the Nebula interface. This phase produces two sub-specs before implementation.

### 2a — Podium

**Dedicated spec:** `PODIUM_INTERFACE_SPEC.md` (written in Phase 0, finalized here)

**Responsibilities:** Relevance scoring → tiered selection → context compilation → audit trail

**Core types:**
```typescript
interface PodiumRequest {
  userId: string
  conversationId: string
  queryText: string
  queryEmbedding: number[]      // pre-computed — never deferred
  scopeFilter: ScopeFilter
  domainSignal: DomainSignal
  intent: QueryIntent
  contextWindowSize: number     // determines tier
}

interface PodiumResult {
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  compiledContext: string        // ready to prepend to system prompt
  auditEntries: InjectionAuditEntry[] // every item with reason — included AND excluded
}
```

**Tier budgets:**
| Tier | Context window | Max budget (tokens) |
|------|---------------|---------------------|
| 1    | ≤ 16K         | 960 (6%)            |
| 2    | 16K–64K       | 5,120 (8%)          |
| 3    | > 64K         | 12,288 (12%)        |

Budget clamping: `Math.min(budget.maxTokens, tierConfig.maxBudget)` — applied in all code paths (v1 bug fix).

**Scoring formula:**
```
score = (semantic * 0.40) + (confidence * 0.25) + (typeWeight * 0.15) + (recency * 0.10) + (scopeMatch * 0.10)
```
Selection: sort by `score / tokenCount` (attention density, not token maximization).
Quality gate: exclude items below threshold even with budget remaining.

**Decay half-lives** (these constants live in `conductor/decay.ts` — Podium reads `confidence` from DB, which decay tick keeps current):
| Type | Half-life | Floor |
|------|-----------|-------|
| invariant, anchor, character, world_rule | ∞ | 1.0 |
| decision | 365 days | 0.30 |
| pattern | 90 days | 0.15 |
| golden_path | 30 days | 0.05 |
| antipattern | 14 days | 0.02 |

**Files:**
```
src/lib/core/podium/
  index.ts          ← PodiumInterface export
  scorer.ts         ← scoring formula + type weights
  tiers.ts          ← tier selection + budget clamping
  compiler.ts       ← context string assembly
  audit.ts          ← InjectionAuditEntry log
  cache.ts          ← Tier 1/2 pre-compiled cache
```

**Guardian gate:** `podium-injection-agent` skill validates before Phase 3.

### 2b — Conductor

**Dedicated spec:** `CONDUCTOR_INTERFACE_SPEC.md` (written in Phase 0, finalized here)

**Responsibilities:** Receive signals → evaluate → propose adjustments → respect guardrails → queue for human review

**Signal types — three tiers:**

| Signal | Source | Approval required | Auto-applied in v2.0 | Cost |
|--------|--------|-------------------|----------------------|------|
| `explicit` | User thumbs up/down | No | Yes — applied immediately to `confidence_base` | Free |
| `heuristic` | Turn-pattern analysis (see below) | No | **No — stored as soft prior only; no automatic delta in v2.0. Calibration deferred to v2.1.** | Free |
| `inaction` | No interaction after 7 days | No | **No — stored; triggers no automatic confidence adjustment in v2.0.** | Free |
| `end_of_session_judge` | Lightweight LLM (Haiku/flash-lite) post-session | Yes — queued as `ConductorProposal` | No — always requires human approval | ~$0.0002/session |

> **Canonical feedback policy (v2.0):** Explicit thumbs signals are the only source of automatic `confidence_base` changes. Heuristic and inaction signals are recorded in the `feedback` table with `source = 'heuristic'`/`'inaction'` and `signal` set accordingly, but the Conductor does not act on them until v2.1 calibration is complete. This keeps the system predictable and prevents unverified confidence drift. See The_Shift.md Addendum — Feedback Signals for rationale.

**Heuristic signals** (v2 built-in, no LLM call — stored as soft priors, not auto-applied):
- User affirmation in next turn ("thanks", "that worked", "perfect") → records weak positive signal
- User immediately rephrased the same question within 2 turns → records weak negative signal
- Session ended without correction within 3 turns of injection → records weak positive signal
- In v2.0 these signals accumulate in the `feedback` table only. In v2.1, once weight calibration is validated offline, the Conductor may apply bounded deltas (±0.03 per signal, capped at ±0.05 per session) automatically.

**End-of-session lightweight judge** (v2 built-in, **disabled by default** — opt-in):
- Sovereignty constraint: sending conversation content to a cloud provider violates Principle 8 unless the user explicitly consents. This feature is **off by default for all tiers** in v2.0.
- Opt-in tiers: Personal and above only. Local/sovereign tier never activates this feature regardless of user setting.
- When opted in: fires asynchronously after conversation ends (fire-and-forget)
- Sends conversation + list of injected items to **cheapest available provider the user has already authorized** (not a new provider relationship)
- Prompt: "Did each injected item help, hurt, or have no effect? Rate briefly."
- Results → `conductor_proposals` with `requires_approval = true`
- User reviews in batch via inbox UI (Phase 5) — never auto-applies
- This is NOT the heavy mid-conversation judge — that remains deferred to Phase 3+
- Schema: `users.endOfSessionJudgeEnabled BOOLEAN NOT NULL DEFAULT FALSE`

**Confidence formula:**
```
confidence_base = (interaction * 0.3 + verification * 0.4 + consistency * 0.2 + consistency_factor * 0.1)
```
- `consistency_factor`: how stably this item has held up across multiple feedback signals (0.0–1.0). This is a signal-history measure, **not** the time-based decay from `decay.ts`. Renaming avoids confusion: `confidence_base` is never modified by the time-decay tick — only by Conductor acting on feedback signals.
- `confidence` (the effective column) IS updated by the decay tick: `confidence = computeDecayedConfidence(confidence_base, ...)`. The invariant `confidence ≤ confidence_base` always holds.
- Ceiling: 1.0 if verified, 0.7 if unverified
- Floor: pinned items are untouchable (Conductor skips them entirely)
- Large deltas (> 0.10 to `confidence_base`) → always requires human approval

**Guardrails (inviolable):**
1. Cannot hard-delete a learning — can only propose archival
2. Cannot promote unverified items beyond `confidence_base` 0.7
3. Cannot adjust pinned items (enforced at read time)
4. All actions emit a `ConductorAuditEntry`

**Proposal inbox model:**
```typescript
interface ConductorProposal {
  id: string
  type: 'promote' | 'demote' | 'archive' | 'merge'
  targetLearningId: string
  confidenceDelta: number       // applied to confidence_base
  rationale: string
  requiresHumanApproval: boolean
  expiresAt: Date               // inaction timeout
  createdAt: Date
}
```

**Queue schema** (additional migration in Phase 2):
```sql
conductor_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  type            TEXT NOT NULL,      -- 'signal_processing'|'lm_judge'|'compaction'
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  locked_at       TIMESTAMPTZ,        -- zombie recovery: reset if locked > 10 min
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)

conductor_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  learning_id     UUID REFERENCES learnings,
  type            TEXT NOT NULL,
  confidence_delta FLOAT NOT NULL,
  rationale       TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'approved'|'rejected'|'expired'
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

**Zombie recovery:** pg_cron every 5 minutes resets items where `locked_at < now() - interval '10 minutes'`. Vercel Cron at `/api/cron/zombie-recovery` as fallback.

**Files:**
```
src/lib/core/conductor/
  index.ts          ← ConductorInterface export
  signals.ts        ← signal ingestion + routing (explicit, heuristic, inaction, end_of_session_judge)
  heuristics.ts     ← turn-pattern analysis → heuristic signal deltas
  confidence.ts     ← formula + floor/ceiling enforcement
  decay.ts          ← computeDecayedConfidence() — single source of truth for decay math
  proposals.ts      ← proposal creation + inbox management
  guardrails.ts     ← invariant enforcement
  queue.ts          ← DB-backed queue + zombie recovery
  judge.ts          ← end-of-session lightweight LLM judge (async, post-conversation)
```

**Guardian gate:** `conductor-spec-agent` skill validates before Phase 3.

---

## Phase 3 — Customization (Layer 2)

**Scope:** Domain seed management API (add/edit seeds, view emergent clusters), decay config overrides, confidence threshold config, MCP server (4 core tools + auth). Domain clusters are recomputed here as a background job, not assigned at conversation time.

MCP tools: `read_nebula` | `get_context` | `inject_learning` | `submit_feedback`
Auth: Bearer token → JWT verify → scoped permissions (`read:nebula` | `write:nebula` | `write:feedback` | `admin`)
Human-in-the-loop: reads are free; writes are queued as `ConductorProposal`

### ChorumClient — Transport Adapter

Routing all Shell traffic through MCP HTTP adds serialization overhead when the Shell and the backend are co-located (same Vercel deployment, same Next.js process). The fix is an adapter interface — the contract is identical; the transport is injected by environment.

```typescript
// src/lib/customization/client.ts — Shell imports this, never MCP directly
export interface ChorumClient {
  readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult>
  getContext(params: GetContextParams): Promise<GetContextResult>
  injectLearning(params: InjectLearningParams): Promise<InjectLearningResult>
  submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult>
}

// LocalChorumClient: direct TypeScript import — used by co-located Next.js App Router
// No HTTP, no serialization. Calls the same handler functions the MCP route calls.
export class LocalChorumClient implements ChorumClient { ... }

// MCPChorumClient: HTTP/stdio transport — used by external clients
// (Claude Desktop, Cursor, Windsurf, CLI)
export class MCPChorumClient implements ChorumClient { ... }
```

The MCP handler functions (`handleReadNebula`, `handleGetContext`, etc.) are the shared implementation. `LocalChorumClient` calls them directly. `MCPChorumClient` calls them via HTTP POST `/api/mcp`. Layer contracts are intact — the Shell always calls `ChorumClient`, never reaches into Layers 0 or 1 directly.

**Guardian gate:** `mcp-contract-agent` skill validates before Phase 4.

---

## Phase 4 — Agent Layer

**Scope:** Provider routing (borrow v1 `src/lib/providers/` verbatim), persona definitions, task-aware routing, tool access controls.

---

## Phase 5 — Shell Layer

**Scope:** Chat UI, settings pages, Conductor inbox UI, scope browser, injection audit viewer.
**Constraint:** Stateless. No business logic. All state in Layer 0.
Design system: Hygge Brutalist tokens (borrowed from v1 `docs/HYGGE_BRUTALIST.md`).

**Guardian gate:** `chorum-layer-guardian` enforces statelessness before any UI component ships.

---

## Guardian Skill Integration

All 5 skills in `tools/skills/` are Claude Code skills invoked at phase boundaries:

| Skill | Gates |
|-------|-------|
| `nebula-schema-guardian` | Phase 0→1, Phase 1→2 |
| `podium-injection-agent` | Phase 2→3 |
| `conductor-spec-agent` | Phase 2→3 |
| `mcp-contract-agent` | Phase 3→4 |
| `chorum-layer-guardian` | Every phase boundary |

---

## What We Borrow from v1 (Explicit List)

| Asset | Source path | Destination | Notes |
|-------|------------|-------------|-------|
| Provider modules | `src/lib/providers/*.ts` | `src/lib/providers/` (verbatim copy) | Used in Phase 4 |
| Embeddings | `src/lib/chorum/embeddings.ts` | `src/lib/nebula/embeddings.ts` | Update dims to 1536 |
| Queue zombie recovery | `src/lib/learning/queue.ts` | Reference only | Pattern for Phase 2 Conductor queue |
| Hygge Brutalist tokens | `docs/HYGGE_BRUTALIST.md` | `src/styles/tokens.css` | Phase 5 only |
| Portability | `src/lib/portability/` | `src/lib/portability/` | v1→v2 export/import bridge |
| Supabase auth pattern | `src/app/api/auth/` | Reference only | Same NextAuth setup |

**Does NOT carry:** `projectLearningPaths`, any `src/app/api/` business logic, Drizzle migration history, v1 schema.

---

## Immediate Next Action

**Phase 0:** Produce the 5 pre-implementation spec documents. Scaffold `chorum-v2/` with Next.js, Drizzle, Supabase Auth. Run `nebula-schema-guardian` and `chorum-layer-guardian` on the empty scaffold to establish baseline.

The first dedicated architecture session after this will be **Phase 1: Nebula Schema** — full DDL review and sign-off before migration `0001` is written.
