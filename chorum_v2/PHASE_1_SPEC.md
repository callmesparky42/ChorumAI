# Phase 1 Specification: Nebula (Layer 0) — Zettelkasten Persistent Store

**Version:** 1.0
**Date:** 2026-02-22
**Status:** Ready for execution
**Assigned to:** Codex 5.3
**Guardian gates:** `nebula-schema-guardian` (populated), `chorum-layer-guardian`
**Prerequisite:** Phase 0 build passing; all guardian baseline checks passing

---

## Agent Instructions

You are executing **Phase 1** of the Chorum 2.0 build. Your job is to implement the Nebula layer — the complete persistent knowledge graph that every other layer reads from and writes to. This phase ends when all 14 database tables exist, pass nebula-schema-guardian, and the full `NebulaInterface` is implemented (including write-time semantic dedup in Phase 1b). No business logic enters `src/lib/nebula/`. None.

Read this document completely before writing a single file. Every decision is locked. Do not interpolate. If something is genuinely missing, flag it as a BLOCKER before proceeding; do not invent.

**What you will produce:**
1. `src/db/schema.ts` — Full Drizzle table definitions for all 14 Nebula tables
2. `drizzle/0001_nebula_core.sql` — Complete SQL migration (generated then amended)
3. `src/lib/nebula/` — 13 implementation files

**What you will NOT produce:**
- Any Podium, Conductor, Binary Star, or Agent logic
- Any UI components, pages, or API routes (except what Phase 0 already stubs)
- Any embedding computation — Nebula stores and retrieves embeddings; it never computes them
- Domain cluster recompute logic (Phase 3 background job)
- Any `any` types or `@ts-ignore` comments

**Layer 0 import rule:** `src/lib/nebula/` may only import from `@/db` and third-party packages. No imports from `@/lib/core`, `@/lib/customization`, `@/lib/agents`, or `@/app`. If you find yourself importing from an outer layer, STOP — you are breaking the architecture.

---

## Reference Documents

| Document | Location | Governs |
|----------|----------|---------|
| Schema Spec | `docs/specs/NEBULA_SCHEMA_SPEC.md` | All 14 table definitions, indexes, invariants |
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | NebulaInterface signature, shared types |
| Deployment Checklist | `CHECKLIST_2.0.md` | Phase 1 → Phase 2 transition gates |
| Schema Guardian | `skills/nebula-schema-guardian/SKILL.md` | Compliance checklist |
| Layer Guardian | `skills/chorum-layer-guardian/SKILL.md` | Import direction enforcement |

---

## Phase 0 Carry-Forward Fixes

The Phase 0 check `phase0.spec_documents` reported FAIL. The validator expected the section header `## Interface(s)` and found either a different heading or no heading at all. Fix these four spec documents before running Phase 1 checks.

### Fix 1: `docs/specs/LAYER_CONTRACTS.md`
Add at the end, before the closing fence:

```markdown
## Interface(s)

See the interface definitions throughout this document:
- **Layer 0 → Layer 1:** `NebulaInterface` in `src/lib/nebula/interface.ts`
- **Layer 1 → Layer 2:** `BinaryStarInterface` in `src/lib/core/interface.ts`
- **Layer 2 → Layer 3:** `ChorumClientInterface` in `src/lib/customization/client.ts`
- **Layer 3 → Layer 4:** `AgentInterface` in `src/lib/agents/interface.ts`
```

### Fix 2: `docs/specs/NEBULA_SCHEMA_SPEC.md`
Add after the `## Error Handling` section:

```markdown
## Interface(s)

The Nebula layer's public interface is `NebulaInterface`, defined in `src/lib/nebula/interface.ts`
and specified in full in `docs/specs/LAYER_CONTRACTS.md` under "Layer 0 → Layer 1".
No other exports from `src/lib/nebula/` are part of the public contract.
```

### Fix 3: `docs/specs/DOMAIN_SEEDS_SPEC.md`
Add after the `## Invariants` section:

```markdown
## Error Handling

- Inserting a duplicate `domain_seeds` label (unique constraint) should surface as a typed error
- `#general` scope tag in analyzer output must be rejected by the validation layer with a typed error
- Missing seed data at cold-start is not an error — domain scoring degrades gracefully to embedding-only

## Interface(s)

Domain seeds are stored in the `domain_seeds` table (see `NEBULA_SCHEMA_SPEC.md`).
No dedicated TypeScript interface is exposed for domain seeds in Phase 1; they are plain database rows
read via raw Drizzle queries in Phase 3 when the domain cluster recompute job runs.
```

---

## Prerequisites

### Real Supabase Credentials (BLOCKED from Phase 0)

Phase 1 requires a live Supabase database. Before running any migration:

1. Create (or use existing) Supabase project
2. Copy `.env.local.example` → `.env.local`
3. Fill in real values:
   ```
   DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres
   NEXTAUTH_SECRET=[random 32+ char string]
   NEXTAUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=[from Google Console]
   GOOGLE_CLIENT_SECRET=[from Google Console]
   ```
4. Enable the pgvector extension in Supabase:
   - Dashboard → Database → Extensions → search "vector" → Enable
   - **Or** the migration's first statement handles this: `CREATE EXTENSION IF NOT EXISTS vector;`

---

## Step 1: Drizzle Schema

Replace `src/db/schema.ts` entirely with the following. The empty `export {}` stub is gone.

```typescript
// src/db/schema.ts
// Phase 1: Full Nebula schema — all 14 tables
// IMPORTANT: Do not add business logic here. Table definitions only.

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Custom pgvector column types
// Drizzle does not have a built-in vector type. Use customType per the docs.
// Two separate types — do not merge dimensions into one column.
// ---------------------------------------------------------------------------

function makeVector(dims: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dims})`,
    toDriver: (v: number[]): string => `[${v.join(',')}]`,
    fromDriver: (v: string): number[] => (v as string).slice(1, -1).split(',').map(Number),
  })
}

const vector1536 = makeVector(1536)
const vector384  = makeVector(384)

// ---------------------------------------------------------------------------
// Supabase auth schema reference — FK only, not managed by drizzle-kit
// ---------------------------------------------------------------------------

const authSchema = pgSchema('auth')

// We reference auth.users for FK purposes only. drizzle-kit will NOT try to
// create this table because it is defined in a pgSchema that is not exported
// from this file as a managed table.
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// ---------------------------------------------------------------------------
// Table: learnings — Core knowledge node (Layer 0 atom)
// ---------------------------------------------------------------------------

export const learnings = pgTable(
  'learnings',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    userId:               uuid('user_id').notNull(),
    // Note: FK to auth.users is enforced in migration SQL, not Drizzle FK ref,
    // because drizzle-kit snapshot diffing with cross-schema FKs is unreliable.
    teamId:               uuid('team_id'),
    content:              text('content').notNull(),
    type:                 text('type').notNull(),
    confidenceBase:       doublePrecision('confidence_base').notNull().default(0.5),
    confidence:           doublePrecision('confidence').notNull().default(0.5),
    extractionMethod:     text('extraction_method').notNull(),
    sourceConversationId: uuid('source_conversation_id'),
    pinnedAt:             timestamp('pinned_at', { withTimezone: true }),
    mutedAt:              timestamp('muted_at', { withTimezone: true }),
    usageCount:           integer('usage_count').notNull().default(0),
    lastUsedAt:           timestamp('last_used_at', { withTimezone: true }),
    promotedAt:           timestamp('promoted_at', { withTimezone: true }),
    createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('learnings_user_id_idx').on(table.userId),
    index('learnings_team_id_idx').on(table.teamId),
    index('learnings_confidence_idx').on(table.confidence),
    index('learnings_type_idx').on(table.type),
    check('confidence_invariant',  sql`${table.confidence} <= ${table.confidenceBase}`),
    check('confidence_range',      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
    check('confidence_base_range', sql`${table.confidenceBase} >= 0 AND ${table.confidenceBase} <= 1`),
  ]
)

// ---------------------------------------------------------------------------
// Table: embeddings_1536 — Cloud embeddings (OpenAI text-embedding-3-*)
// ---------------------------------------------------------------------------

export const embeddings1536 = pgTable('embeddings_1536', {
  learningId: uuid('learning_id').primaryKey().references(() => learnings.id, { onDelete: 'cascade' }),
  embedding:  vector1536('embedding').notNull(),
  modelName:  text('model_name').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: embeddings_384 — Local embeddings (sovereignty-safe, Ollama / SentenceTransformers)
// ---------------------------------------------------------------------------

export const embeddings384 = pgTable('embeddings_384', {
  learningId: uuid('learning_id').primaryKey().references(() => learnings.id, { onDelete: 'cascade' }),
  embedding:  vector384('embedding').notNull(),
  modelName:  text('model_name').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: learning_scopes — Many-to-many scope tags
// ---------------------------------------------------------------------------

export const learningScopes = pgTable(
  'learning_scopes',
  {
    learningId: uuid('learning_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    scope:      text('scope').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.learningId, table.scope] }),
    index('learning_scopes_scope_idx').on(table.scope),
    index('learning_scopes_learning_idx').on(table.learningId),
  ]
)

// ---------------------------------------------------------------------------
// Table: learning_links — Zettelkasten directed edges
// ---------------------------------------------------------------------------

export const learningLinks = pgTable(
  'learning_links',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    sourceId:  uuid('source_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    targetId:  uuid('target_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    linkType:  text('link_type').notNull(),
    strength:  doublePrecision('strength').notNull().default(0.5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('no_self_link', sql`${table.sourceId} != ${table.targetId}`),
  ]
)

// ---------------------------------------------------------------------------
// Table: cooccurrence — Usage cohort (which learnings appear together)
// ---------------------------------------------------------------------------

export const cooccurrence = pgTable(
  'cooccurrence',
  {
    learningA:     uuid('learning_a').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    learningB:     uuid('learning_b').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    count:         integer('count').notNull().default(1),
    positiveCount: integer('positive_count').notNull().default(0),
    negativeCount: integer('negative_count').notNull().default(0),
    lastSeen:      timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.learningA, table.learningB] }),
    check('ordered_pair', sql`${table.learningA} < ${table.learningB}`),
  ]
)

// ---------------------------------------------------------------------------
// Table: feedback — All feedback signals (all 4 source types)
// ---------------------------------------------------------------------------

export const feedback = pgTable(
  'feedback',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    userId:         uuid('user_id').notNull(),
    learningId:     uuid('learning_id').references(() => learnings.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    injectionId:    uuid('injection_id'),
    signal:         text('signal').notNull(),
    source:         text('source').notNull(),
    processed:      boolean('processed').notNull().default(false),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_user_unprocessed_idx').on(table.userId, table.processed),
  ]
)

// ---------------------------------------------------------------------------
// Table: projects — UI-level saved scope filters (not containers)
// ---------------------------------------------------------------------------

export const projects = pgTable('projects', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id').notNull(),
  teamId:          uuid('team_id'),
  name:            text('name').notNull(),
  scopeFilter:     jsonb('scope_filter').notNull().default(sql`'{"include":[],"exclude":[]}'::jsonb`),
  domainClusterId: uuid('domain_cluster_id'),
  crossLensAccess: boolean('cross_lens_access').notNull().default(false),
  settings:        jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: domain_seeds — System-shipped type/weight hints for domain signals
// ---------------------------------------------------------------------------

export const domainSeeds = pgTable('domain_seeds', {
  id:             uuid('id').primaryKey().defaultRandom(),
  label:          text('label').notNull().unique(),
  signalKeywords: jsonb('signal_keywords').notNull(),
  preferredTypes: jsonb('preferred_types').notNull(),
  isSystem:       boolean('is_system').notNull().default(false),
})

// ---------------------------------------------------------------------------
// Table: domain_clusters — Emergent clusters from scope tag co-occurrence
// ---------------------------------------------------------------------------

export const domainClusters = pgTable('domain_clusters', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  label:          text('label').notNull(),
  scopeTags:      jsonb('scope_tags').notNull(),
  centroid1536:   vector1536('centroid_1536'),
  centroid384:    vector384('centroid_384'),
  confidence:     doublePrecision('confidence').notNull().default(0.5),
  learningCount:  integer('learning_count').notNull().default(0),
  lastRecomputed: timestamp('last_recomputed', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: injection_audit — Full injection decision log
// ---------------------------------------------------------------------------

export const injectionAudit = pgTable(
  'injection_audit',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    userId:         uuid('user_id').notNull(),
    conversationId: uuid('conversation_id'),
    learningId:     uuid('learning_id').references(() => learnings.id, { onDelete: 'set null' }),
    included:       boolean('included').notNull(),
    score:          doublePrecision('score').notNull(),
    reason:         text('reason'),
    excludeReason:  text('exclude_reason'),
    tierUsed:       integer('tier_used').notNull(),
    tokensUsed:     integer('tokens_used'),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('injection_audit_user_time_idx').on(table.userId, table.createdAt),
  ]
)

// ---------------------------------------------------------------------------
// Table: conductor_queue — Background job queue
// ---------------------------------------------------------------------------

export const conductorQueue = pgTable(
  'conductor_queue',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    userId:    uuid('user_id').notNull(),
    type:      text('type').notNull(),
    payload:   jsonb('payload').notNull(),
    status:    text('status').notNull().default('pending'),
    attempts:  integer('attempts').notNull().default(0),
    lockedAt:  timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conductor_queue_pending_idx').on(table.userId, table.status),
    index('conductor_queue_locked_idx').on(table.lockedAt),
  ]
)

// ---------------------------------------------------------------------------
// Table: conductor_proposals — Pending confidence adjustments (human approval required)
// ---------------------------------------------------------------------------

export const conductorProposals = pgTable('conductor_proposals', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  learningId:       uuid('learning_id').references(() => learnings.id, { onDelete: 'cascade' }),
  type:             text('type').notNull(),
  confidenceDelta:  doublePrecision('confidence_delta').notNull(),
  rationale:        text('rationale').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  status:           text('status').notNull().default('pending'),
  expiresAt:        timestamp('expires_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: api_tokens — MCP Bearer tokens
// ---------------------------------------------------------------------------

export const apiTokens = pgTable(
  'api_tokens',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull(),
    name:        text('name').notNull(),
    hashedToken: text('hashed_token').notNull().unique(),
    scopes:      jsonb('scopes').notNull().default(sql`'[]'::jsonb`),
    lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
    expiresAt:   timestamp('expires_at', { withTimezone: true }),
    revokedAt:   timestamp('revoked_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_tokens_active_idx').on(table.hashedToken),
  ]
)
```

---

## Step 2: Generate and Amend the Migration

### 2.1 Generate

```bash
cd chorum-v2
npx drizzle-kit generate --name nebula_core
```

Drizzle-kit will create a file in `drizzle/`. The filename will be `0000_nebula_core.sql` (or `0001_nebula_core.sql` if the journal already has a prior entry).

**Rename the generated file to `drizzle/0001_nebula_core.sql`** if it is not already named that. Update `drizzle/meta/_journal.json` to reflect the new filename if you rename.

### 2.2 Amend the generated migration

The generated SQL will have correct `CREATE TABLE` statements. You must add two things.

**Prepend (before any CREATE TABLE):**

```sql
-- Enable pgvector extension. Must run before any vector column DDL.
CREATE EXTENSION IF NOT EXISTS vector;
```

**Append (after all CREATE TABLE and FK statements):**

```sql
-- ANN indexes for semantic search.
-- lists = 100 is correct for ~10K rows (IVFFlat rule: lists ≈ sqrt(N)).
-- Note: queries require SET ivfflat.probes = 10 (or higher) for recall.
-- HNSW migration path available at >500K rows (see NEBULA_SCHEMA_SPEC.md).
CREATE INDEX embeddings_1536_ann_idx ON embeddings_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX embeddings_384_ann_idx  ON embeddings_384  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Verify the generated migration also includes:**

- `REFERENCES auth.users` on `learnings.user_id`, `feedback.user_id`, `projects.user_id`, `injection_audit.user_id`, `api_tokens.user_id`, `domain_clusters.user_id`

If drizzle-kit omitted `auth.users` FK constraints (because we didn't use Drizzle's `.references()` on userId for `learnings`), add them manually:

```sql
-- Add to CREATE TABLE learnings or as ALTER TABLE after:
ALTER TABLE learnings
  ADD CONSTRAINT learnings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

Repeat for any other table where the user_id FK to auth.users is missing from the generated output.

### 2.3 Apply the migration

```bash
npx drizzle-kit migrate
```

Or apply the SQL directly in the Supabase dashboard SQL editor if preferred.

---

## Step 3: Nebula Layer Implementation

Implement the 13 files below in order. Each file must compile without errors before moving to the next.

---

### 3.1 `src/lib/nebula/errors.ts`

```typescript
// src/lib/nebula/errors.ts
// Layer 0 error taxonomy. All Nebula errors extend NebulaError.
// Layer 1+ must catch NebulaError and not expose DB internals upward.

export type NebulaErrorCode =
  | 'NOT_FOUND'
  | 'CONSTRAINT_VIOLATION'
  | 'INVALID_INPUT'
  | 'DUPLICATE_SCOPE_TAG'          // '#general' attempted
  | 'CROSS_LENS_DENIED'            // allowCrossLens = false but query would cross scopes
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'EMBEDDING_DIM_MISMATCH'       // embedding passed doesn't match declared dims
  | 'INTERNAL'

export class NebulaError extends Error {
  constructor(
    public readonly code: NebulaErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'NebulaError'
  }
}
```

---

### 3.2 `src/lib/nebula/types.ts`

Exact copy of the shared primitives from `docs/specs/LAYER_CONTRACTS.md`. Do not add to or remove from this list — these are the locked contracts.

```typescript
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
  boost:   string[]    // scope tags that add a relevance bonus (OR match)
}

export interface Learning {
  id:                   string
  userId:               string
  teamId:               string | null
  content:              string
  type:                 LearningType
  confidenceBase:       number    // raw score; never modified by decay tick
  confidence:           number    // effective value; updated by nightly decay job
  extractionMethod:     ExtractionMethod
  sourceConversationId: string | null
  pinnedAt:             Date | null
  mutedAt:              Date | null
  usageCount:           number
  lastUsedAt:           Date | null
  promotedAt:           Date | null
  createdAt:            Date
  updatedAt:            Date
}

export interface ScoredLearning extends Learning {
  score:            number
  scopeMatchScore:  number
  semanticScore:    number
}

export interface LearningLink {
  id:        string
  sourceId:  string
  targetId:  string
  linkType:  LinkType
  strength:  number
  createdAt: Date
}

export interface CooccurrenceEntry {
  learningId:    string
  count:         number
  positiveCount: number
  negativeCount: number
  lastSeen:      Date
}

export interface Feedback {
  id:             string
  userId:         string
  learningId:     string | null
  conversationId: string | null
  injectionId:    string | null
  signal:         SignalValue
  source:         SignalSource
  processed:      boolean
  createdAt:      Date
}

export interface InjectionAuditEntry {
  id:             string
  userId:         string
  conversationId: string | null
  learningId:     string | null
  included:       boolean
  score:          number
  reason:         string | null
  excludeReason:  string | null
  tierUsed:       1 | 2 | 3
  tokensUsed:     number | null
  createdAt:      Date
}

export interface ApiToken {
  id:          string
  userId:      string
  name:        string
  hashedToken: string
  scopes:      TokenScope[]
  lastUsedAt:  Date | null
  expiresAt:   Date | null
  revokedAt:   Date | null
  createdAt:   Date
}

export type TokenScope =
  | 'read:nebula'
  | 'write:nebula'
  | 'write:feedback'
  | 'admin'
```

---

### 3.3 `src/lib/nebula/interface.ts`

Replace the Phase 0 stub entirely. This is the full contract.

```typescript
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

export type { Learning, ScoredLearning, LearningLink, CooccurrenceEntry,
  Feedback, InjectionAuditEntry, ApiToken, ScopeFilter,
  LearningType, ExtractionMethod } from './types'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateLearningInput {
  userId:               string
  teamId?:              string
  content:              string
  type:                 LearningType
  extractionMethod:     ExtractionMethod
  sourceConversationId?: string
  scopes:               string[]
  confidenceBase?:      number        // default 0.5

  // Phase 1b: optional embedding for write-time semantic dedup.
  // If provided, createLearning checks for near-duplicates (threshold 0.85,
  // same type + same user). If a duplicate is found: update existing wording
  // (newer wording wins) and return the existing learning. No new row.
  embedding?:      number[]
  embeddingDims?:  384 | 1536
  embeddingModel?: string
}

export interface FeedbackInput {
  userId:          string
  learningId?:     string
  conversationId?: string
  injectionId?:    string
  signal:          'positive' | 'negative' | 'none'
  source:          'explicit' | 'heuristic' | 'inaction' | 'llm_judge'
}

export interface CreateApiTokenInput {
  userId:    string
  name:      string
  scopes:    string[]
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
```

---

### 3.4 `src/lib/nebula/dedup.ts`

Write-time semantic dedup. This is Phase 1b. Read carefully before implementing.

**Algorithm:**
1. Only runs when `CreateLearningInput` includes an `embedding`
2. Queries the appropriate embedding table for the nearest neighbour to the new embedding
3. Filter by: same `userId` + same `type`
4. If nearest distance < (1 − 0.85) = 0.15 cosine distance → it's a near-duplicate
5. Near-duplicate detected: UPDATE `content` + `updatedAt` on existing row (newer wording wins), return existing learning
6. No near-duplicate: proceed with normal insert

```typescript
// src/lib/nebula/dedup.ts
import { db } from '@/db'
import { learnings, embeddings1536, embeddings384 } from '@/db/schema'
import { sql, eq, and } from 'drizzle-orm'
import type { LearningType } from './types'
import type { Learning } from './types'

export const DEDUP_THRESHOLD = 0.85  // cosine similarity (1 = identical)

export interface DedupResult {
  isDuplicate: boolean
  existingId:  string | null
}

/**
 * Check if a near-duplicate learning already exists for this user + type.
 * Uses pgvector cosine distance operator (<=>).
 * Returns the ID of the nearest match if similarity >= DEDUP_THRESHOLD.
 */
export async function findNearDuplicate(
  userId:    string,
  type:      LearningType,
  embedding: number[],
  dims:      384 | 1536,
): Promise<DedupResult> {
  const embStr  = `[${embedding.join(',')}]`
  const dimStr  = String(dims)
  const tbl     = dims === 1536 ? sql`embeddings_1536` : sql`embeddings_384`
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
 * Also bumps updatedAt. Does NOT touch confidenceBase or confidence.
 */
export async function mergeWithExisting(
  existingId:  string,
  newContent:  string,
): Promise<void> {
  await db
    .update(learnings)
    .set({
      content:   newContent,
      updatedAt: new Date(),
    })
    .where(eq(learnings.id, existingId))
}
```

---

### 3.5 `src/lib/nebula/queries.ts`

Core CRUD for the `learnings` table. The `createLearning` function is where dedup integrates.

```typescript
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
    id:                   row.id,
    userId:               row.userId,
    teamId:               row.teamId ?? null,
    content:              row.content,
    type:                 row.type as LearningType,
    confidenceBase:       row.confidenceBase,
    confidence:           row.confidence,
    extractionMethod:     row.extractionMethod as ExtractionMethod,
    sourceConversationId: row.sourceConversationId ?? null,
    pinnedAt:             row.pinnedAt ?? null,
    mutedAt:              row.mutedAt ?? null,
    usageCount:           row.usageCount,
    lastUsedAt:           row.lastUsedAt ?? null,
    promotedAt:           row.promotedAt ?? null,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
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
      // Newer wording wins — update content silently, return existing
      await mergeWithExisting(dedup.existingId, input.content)
      const existing = await getLearning(dedup.existingId)
      if (!existing) throw new NebulaError('INTERNAL', 'Dedup target vanished during merge')
      return existing
    }
  }

  // Insert learning row
  const [row] = await db
    .insert(learnings)
    .values({
      userId:               input.userId,
      teamId:               input.teamId ?? null,
      content:              input.content,
      type:                 input.type,
      confidenceBase:       input.confidenceBase ?? 0.5,
      confidence:           input.confidenceBase ?? 0.5,
      extractionMethod:     input.extractionMethod,
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

  if (patch.content       !== undefined) update.content       = patch.content
  if (patch.type          !== undefined) update.type          = patch.type
  if (patch.confidenceBase !== undefined) update.confidenceBase = patch.confidenceBase
  if (patch.confidence    !== undefined) update.confidence    = patch.confidence
  if (patch.pinnedAt      !== undefined) update.pinnedAt      = patch.pinnedAt
  if (patch.mutedAt       !== undefined) update.mutedAt       = patch.mutedAt
  if (patch.usageCount    !== undefined) update.usageCount    = patch.usageCount
  if (patch.lastUsedAt    !== undefined) update.lastUsedAt    = patch.lastUsedAt
  if (patch.promotedAt    !== undefined) update.promotedAt    = patch.promotedAt

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
```

---

### 3.6 `src/lib/nebula/embeddings.ts`

Embedding storage and semantic search.

```typescript
// src/lib/nebula/embeddings.ts
import { db } from '@/db'
import { learnings, learningScopes, embeddings1536, embeddings384 } from '@/db/schema'
import { eq, and, notInArray, sql, inArray } from 'drizzle-orm'
import type { Learning, ScoredLearning, ScopeFilter, LearningType, ExtractionMethod } from './types'
import { NebulaError } from './errors'

function rowToLearning(row: typeof learnings.$inferSelect): Learning {
  return {
    id:                   row.id,
    userId:               row.userId,
    teamId:               row.teamId ?? null,
    content:              row.content,
    type:                 row.type as LearningType,
    confidenceBase:       row.confidenceBase,
    confidence:           row.confidence,
    extractionMethod:     row.extractionMethod as ExtractionMethod,
    sourceConversationId: row.sourceConversationId ?? null,
    pinnedAt:             row.pinnedAt ?? null,
    mutedAt:              row.mutedAt ?? null,
    usageCount:           row.usageCount,
    lastUsedAt:           row.lastUsedAt ?? null,
    promotedAt:           row.promotedAt ?? null,
    createdAt:            row.createdAt,
    updatedAt:            row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// setEmbedding — upsert embedding row
// ---------------------------------------------------------------------------

export async function setEmbedding(
  learningId: string,
  embedding:  number[],
  dims:       384 | 1536,
  model:      string,
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
  const row   = await db.query[dims === 1536 ? 'embeddings1536' : 'embeddings384']
    ?.findFirst({ where: eq(table.learningId, learningId) })
  return !!row
}

// ---------------------------------------------------------------------------
// getLearningsWithoutEmbedding — for backfill jobs
// ---------------------------------------------------------------------------

export async function getLearningsWithoutEmbedding(
  dims:  384 | 1536,
  limit: number,
): Promise<Learning[]> {
  const table  = dims === 1536 ? embeddings1536 : embeddings384
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
  embedding:      number[],
  dims:           384 | 1536,
  scopeFilter:    ScopeFilter,
  limit:          number,
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
  const tbl    = dims === 1536 ? sql`embeddings_1536` : sql`embeddings_384`
  const cast   = sql.raw(`::vector(${dimStr})`)

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
    source_conversation_id: string | null; pinned_at: Date | null; muted_at: Date | null;
    usage_count: number; last_used_at: Date | null; promoted_at: Date | null;
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
    WHERE  l.muted_at IS NULL
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
      id:                   row.id,
      userId:               row.user_id,
      teamId:               row.team_id,
      content:              row.content,
      type:                 row.type as LearningType,
      confidenceBase:       row.confidence_base,
      confidence:           row.confidence,
      extractionMethod:     row.extraction_method as ExtractionMethod,
      sourceConversationId: row.source_conversation_id,
      pinnedAt:             row.pinned_at,
      mutedAt:              row.muted_at,
      usageCount:           row.usage_count,
      lastUsedAt:           row.last_used_at,
      promotedAt:           row.promoted_at,
      createdAt:            row.created_at,
      updatedAt:            row.updated_at,
      score,
      scopeMatchScore,
      semanticScore:        row.semantic_score,
    } satisfies ScoredLearning
  })
}
```

---

### 3.7 `src/lib/nebula/links.ts`

```typescript
// src/lib/nebula/links.ts
import { db } from '@/db'
import { learningLinks } from '@/db/schema'
import { or, eq } from 'drizzle-orm'
import type { LearningLink, LinkType } from './types'

function rowToLink(row: typeof learningLinks.$inferSelect): LearningLink {
  return {
    id:        row.id,
    sourceId:  row.sourceId,
    targetId:  row.targetId,
    linkType:  row.linkType as LinkType,
    strength:  row.strength,
    createdAt: row.createdAt,
  }
}

export async function createLink(
  sourceId: string,
  targetId: string,
  type:     LinkType,
  strength: number,
): Promise<void> {
  await db.insert(learningLinks).values({ sourceId, targetId, linkType: type, strength })
}

export async function getLinksFor(learningId: string): Promise<LearningLink[]> {
  const rows = await db
    .select()
    .from(learningLinks)
    .where(or(eq(learningLinks.sourceId, learningId), eq(learningLinks.targetId, learningId)))

  return rows.map(rowToLink)
}
```

---

### 3.8 `src/lib/nebula/cooccurrence.ts`

```typescript
// src/lib/nebula/cooccurrence.ts
import { db } from '@/db'
import { cooccurrence, learnings } from '@/db/schema'
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
      const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
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
```

---

### 3.9 `src/lib/nebula/feedback.ts`

```typescript
// src/lib/nebula/feedback.ts
import { db } from '@/db'
import { feedback } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import type { Feedback, SignalSource, SignalValue } from './types'
import type { FeedbackInput } from './interface'

function rowToFeedback(row: typeof feedback.$inferSelect): Feedback {
  return {
    id:             row.id,
    userId:         row.userId,
    learningId:     row.learningId ?? null,
    conversationId: row.conversationId ?? null,
    injectionId:    row.injectionId ?? null,
    signal:         row.signal as SignalValue,
    source:         row.source as SignalSource,
    processed:      row.processed,
    createdAt:      row.createdAt,
  }
}

export async function recordFeedback(input: FeedbackInput): Promise<void> {
  await db.insert(feedback).values({
    userId:         input.userId,
    learningId:     input.learningId ?? null,
    conversationId: input.conversationId ?? null,
    injectionId:    input.injectionId ?? null,
    signal:         input.signal,
    source:         input.source,
    processed:      false,
  })
}

export async function getPendingFeedback(userId: string): Promise<Feedback[]> {
  const rows = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.userId, userId), eq(feedback.processed, false)))

  return rows.map(rowToFeedback)
}

export async function markFeedbackProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(feedback).set({ processed: true }).where(inArray(feedback.id, ids))
}
```

---

### 3.10 `src/lib/nebula/audit.ts`

```typescript
// src/lib/nebula/audit.ts
import { db } from '@/db'
import { injectionAudit } from '@/db/schema'
import type { InjectionAuditEntry } from './types'

export async function logInjectionAudit(
  entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[],
): Promise<void> {
  if (entries.length === 0) return

  await db.insert(injectionAudit).values(
    entries.map((e) => ({
      userId:         e.userId,
      conversationId: e.conversationId ?? null,
      learningId:     e.learningId ?? null,
      included:       e.included,
      score:          e.score,
      reason:         e.reason ?? null,
      excludeReason:  e.excludeReason ?? null,
      tierUsed:       e.tierUsed,
      tokensUsed:     e.tokensUsed ?? null,
    }))
  )
}
```

---

### 3.11 `src/lib/nebula/tokens.ts`

MCP Bearer token management. Uses `bcryptjs` for hashing (already in package.json).

```typescript
// src/lib/nebula/tokens.ts
import { db } from '@/db'
import { apiTokens } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { hash, compare } from 'bcryptjs'
import type { ApiToken, TokenScope } from './types'
import type { CreateApiTokenInput } from './interface'
import { NebulaError } from './errors'
import { randomBytes } from 'crypto'

function rowToToken(row: typeof apiTokens.$inferSelect): ApiToken {
  return {
    id:          row.id,
    userId:      row.userId,
    name:        row.name,
    hashedToken: row.hashedToken,
    scopes:      (row.scopes as TokenScope[]) ?? [],
    lastUsedAt:  row.lastUsedAt ?? null,
    expiresAt:   row.expiresAt ?? null,
    revokedAt:   row.revokedAt ?? null,
    createdAt:   row.createdAt,
  }
}

/**
 * Validate a Bearer token. Returns the token record if valid, null otherwise.
 * Updates lastUsedAt on success (fire-and-forget).
 *
 * IMPORTANT: The hashed_token column stores a bcrypt hash.
 * The caller passes the plain-text token from the Authorization header.
 * We use bcrypt compare — NOT a direct lookup — to validate.
 *
 * Performance note: bcrypt compare is slow by design. For high-throughput MCP
 * endpoints, add a short-lived in-memory token cache in Phase 3.
 */
export async function validateApiToken(plainToken: string): Promise<ApiToken | null> {
  // We cannot do a direct WHERE lookup on the hash (bcrypt is not reversible).
  // Strategy: hash prefix lookup. We store a fast SHA-256 prefix as a secondary
  // index key. Phase 3 optimization. For Phase 1: full table scan with bcrypt
  // compare is acceptable (token table will be tiny: <100 rows per user).
  //
  // PHASE 1 IMPLEMENTATION: iterate active (non-revoked, non-expired) tokens
  // and bcrypt.compare against each. This is O(n) but correct.

  const now = new Date()
  const activeRows = await db
    .select()
    .from(apiTokens)
    .where(and(isNull(apiTokens.revokedAt)))

  for (const row of activeRows) {
    if (row.expiresAt && row.expiresAt < now) continue

    const match = await compare(plainToken, row.hashedToken)
    if (match) {
      // Fire-and-forget: update lastUsedAt
      db.update(apiTokens)
        .set({ lastUsedAt: now })
        .where(eq(apiTokens.id, row.id))
        .catch(() => { /* non-critical */ })

      return rowToToken(row)
    }
  }

  return null
}

export async function createApiToken(
  input: CreateApiTokenInput,
): Promise<{ token: string; record: ApiToken }> {
  const plainToken  = randomBytes(32).toString('hex')   // 64-char hex token
  const hashedToken = await hash(plainToken, 12)

  const [row] = await db
    .insert(apiTokens)
    .values({
      userId:      input.userId,
      name:        input.name,
      hashedToken,
      scopes:      input.scopes,
      expiresAt:   input.expiresAt ?? null,
    })
    .returning()

  if (!row) throw new NebulaError('INTERNAL', 'Token insert returned no row')

  return { token: plainToken, record: rowToToken(row) }
}

export async function revokeApiToken(id: string): Promise<void> {
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id))
}
```

---

### 3.12 `src/lib/nebula/impl.ts`

The `NebulaInterface` implementation. Wires all modules together. This is the only file that Layer 1 receives.

```typescript
// src/lib/nebula/impl.ts
// NebulaInterface implementation — wires all Nebula modules.
// Layer 1 calls createNebula() once (singleton) and interacts only through NebulaInterface.

import type { NebulaInterface, CreateLearningInput, FeedbackInput, CreateApiTokenInput } from './interface'
import type { Learning, ScoredLearning, LearningLink, LinkType, CooccurrenceEntry,
  Feedback, InjectionAuditEntry, ApiToken, ScopeFilter } from './types'

import { createLearning, getLearning, updateLearning, deleteLearning, getLearningsByScope } from './queries'
import { searchByEmbedding, setEmbedding, hasEmbedding, getLearningsWithoutEmbedding } from './embeddings'
import { createLink, getLinksFor } from './links'
import { recordCooccurrence, getCohort } from './cooccurrence'
import { recordFeedback, getPendingFeedback, markFeedbackProcessed } from './feedback'
import { logInjectionAudit } from './audit'
import { validateApiToken, createApiToken, revokeApiToken } from './tokens'

class NebulaImpl implements NebulaInterface {
  async createLearning(input: CreateLearningInput): Promise<Learning> {
    return createLearning(input)
  }

  async getLearning(id: string): Promise<Learning | null> {
    return getLearning(id)
  }

  async updateLearning(id: string, patch: Parameters<NebulaInterface['updateLearning']>[1]): Promise<Learning> {
    return updateLearning(id, patch)
  }

  async deleteLearning(id: string): Promise<void> {
    return deleteLearning(id)
  }

  async getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]> {
    return getLearningsByScope(scopes, userId)
  }

  async searchByEmbedding(
    embedding: number[],
    dims: 384 | 1536,
    scopeFilter: ScopeFilter,
    limit: number,
    allowCrossLens?: boolean,
  ): Promise<ScoredLearning[]> {
    return searchByEmbedding(embedding, dims, scopeFilter, limit, allowCrossLens ?? false)
  }

  async setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void> {
    return setEmbedding(learningId, embedding, dims, model)
  }

  async hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean> {
    return hasEmbedding(learningId, dims)
  }

  async getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]> {
    return getLearningsWithoutEmbedding(dims, limit)
  }

  async createLink(sourceId: string, targetId: string, type: LinkType, strength: number): Promise<void> {
    return createLink(sourceId, targetId, type, strength)
  }

  async getLinksFor(learningId: string): Promise<LearningLink[]> {
    return getLinksFor(learningId)
  }

  async recordCooccurrence(ids: string[]): Promise<void> {
    return recordCooccurrence(ids)
  }

  async getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]> {
    return getCohort(learningId, limit)
  }

  async recordFeedback(input: FeedbackInput): Promise<void> {
    return recordFeedback(input)
  }

  async getPendingFeedback(userId: string): Promise<Feedback[]> {
    return getPendingFeedback(userId)
  }

  async markFeedbackProcessed(ids: string[]): Promise<void> {
    return markFeedbackProcessed(ids)
  }

  async logInjectionAudit(entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[]): Promise<void> {
    return logInjectionAudit(entries)
  }

  async validateApiToken(hashedToken: string): Promise<ApiToken | null> {
    return validateApiToken(hashedToken)
  }

  async createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }> {
    return createApiToken(input)
  }

  async revokeApiToken(id: string): Promise<void> {
    return revokeApiToken(id)
  }
}

// Singleton — create once per process
let _nebula: NebulaInterface | null = null

export function createNebula(): NebulaInterface {
  if (!_nebula) {
    _nebula = new NebulaImpl()
  }
  return _nebula
}
```

---

### 3.13 `src/lib/nebula/index.ts`

Update the Phase 0 stub to export the implementation factory and types.

```typescript
// src/lib/nebula/index.ts
// Layer 0 — Zettelkasten / Nebula public surface
// Layer 1 imports NebulaInterface and createNebula only.
// No direct table or query imports from outside this package.

export type { NebulaInterface, CreateLearningInput, FeedbackInput, CreateApiTokenInput } from './interface'
export type { Learning, ScoredLearning, LearningLink, LinkType, CooccurrenceEntry,
  Feedback, InjectionAuditEntry, ApiToken, ScopeFilter, LearningType,
  ExtractionMethod, SignalSource, SignalValue, TokenScope } from './types'
export { NebulaError } from './errors'
export type { NebulaErrorCode } from './errors'
export { createNebula } from './impl'
```

---

## Step 4: Build Verification

Run after all files are written:

```bash
npx next build
```

Expected: exit 0, zero TypeScript errors, zero `any` without justification, zero `@ts-ignore`.

Common issues to resolve:
- `db.query.embeddings1536` — verify the schema export name matches what Drizzle generates for the relation query. Use `db.select().from(embeddings1536).where(...)` if the relation query API isn't available.
- `satisfies ScoredLearning` in embeddings.ts — requires TypeScript 4.9+. Replace with explicit type annotation `as ScoredLearning` if needed.
- Raw SQL template literal types — `db.execute<RowType>(sql\`...\`)` may need the generic type parameter adjusted for the Drizzle version installed.

---

## Step 5: Guardian Validation

Run these guardian skills in order. Both must pass before Phase 1 is complete.

### 5.1 chorum-layer-guardian

Load `skills/chorum-layer-guardian/SKILL.md` and audit all new files in `src/lib/nebula/`.

**Expected:** No imports from `@/lib/core`, `@/lib/customization`, `@/lib/agents`, or `@/app` in any Nebula file.

If any violation is found: fix the import direction before proceeding.

### 5.2 nebula-schema-guardian

Load `skills/nebula-schema-guardian/SKILL.md` and run all 6 checks against the new `schema.ts`.

**Expected checklist pass:**

| Check | Expected |
|-------|----------|
| 1. Federation | All tables with user_id: `learnings`, `feedback`, `projects`, `injection_audit`, `conductor_queue`, `conductor_proposals`, `api_tokens`, `domain_clusters` have `userId: uuid(...).notNull()` |
| 2. Ownership | No FK from learnings → projects |
| 3. Required Fields | `confidence_base` AND `confidence` both present; embeddings NOT on learnings |
| 4. Type Safety | All type columns are TEXT; confidence is doublePrecision; IDs are UUID |
| 5. Index Check | ivfflat on embeddings_1536 + embeddings_384 in migration; NO vector index on learnings |
| 6. Cross-Lens Safety | `searchByEmbedding` accepts `allowCrossLens` param (default false); cross-lens results logged |

**Also verify:**
- `dedup.ts` implements `findNearDuplicate` with threshold 0.85
- `createLearning` calls `findNearDuplicate` when embedding provided
- `#general` scope tag is rejected

---

## Completion Criteria

Map to `CHECKLIST_2.0.md` Phase 1 → Phase 2 Transition:

| Checklist Item | How to verify |
|----------------|---------------|
| Migration `0001_nebula_core.sql` applied successfully | `npx drizzle-kit migrate` exits 0 |
| All 14 tables created with correct columns | `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` shows all 14 |
| pgvector extension enabled | `SELECT * FROM pg_extension WHERE extname = 'vector'` returns a row |
| Indexes created (user_id, team_id, scope, embeddings) | `\d+ learnings` in psql shows indexes |
| CRUD functions exist in `src/lib/nebula/` | `createLearning`, `getLearning`, `updateLearning`, `deleteLearning` all present |
| Embedding insertion works (both 1536 and 384 tables) | Insert a test learning with `setEmbedding`; confirm row in `embeddings_1536` |
| Graph query returns results (semantic similarity search) | `searchByEmbedding` returns results after seeding 3+ learnings |
| nebula-schema-guardian passes on populated schema | All 6 checks PASS |
| No business logic in nebula/ — pure data access | Layer guardian passes; no scoring algorithms, no LLM calls |

**Note on checklist count:** CHECKLIST_2.0.md says "All 13 tables" — this is a discrepancy from NEBULA_SCHEMA_SPEC.md which defines 14 tables. The spec wins. The checklist will be corrected at Phase 2 gate review.

---

## Changelog Entry

Add to `CHANGELOG.md` under `[2.0.0-alpha.1]`:

```markdown
## [2.0.0-alpha.1] — Phase 1: Nebula (Layer 0)

### Added
- Full Drizzle schema: 14 tables (learnings, embeddings_1536, embeddings_384,
  learning_scopes, learning_links, cooccurrence, feedback, projects,
  domain_seeds, domain_clusters, injection_audit, conductor_queue,
  conductor_proposals, api_tokens)
- Migration 0001_nebula_core.sql — Nebula persistent substrate
- pgvector extension with ivfflat indexes on both embedding tables
- Complete NebulaInterface implementation (13 files in src/lib/nebula/)
- Phase 1b: write-time semantic dedup in createLearning() — threshold 0.85,
  same-type + same-user, newer wording wins
- Cross-lens access gated on allowCrossLens flag (default false)
- API token auth with bcrypt hashing (validateApiToken, createApiToken, revokeApiToken)

### Fixed
- Phase 0 spec_documents validator: added ## Interface(s) section headers to
  LAYER_CONTRACTS.md, NEBULA_SCHEMA_SPEC.md, DOMAIN_SEEDS_SPEC.md

### Notes
- Embeddings stored in typed tables (embeddings_1536, embeddings_384) — NOT on learnings
- confidence_base and confidence are separate columns (Conductor invariant)
- No business logic in src/lib/nebula/ — pure data access
```

---

## Codex Notes

**Before generating any file:**
1. Load `skills/chorum-layer-guardian/SKILL.md` — run it on every file you produce
2. Load `skills/nebula-schema-guardian/SKILL.md` — run it on schema.ts and the migration

**Common drift patterns to avoid:**
- Do NOT add `embedding VECTOR(1536)` to the `learnings` table — use `embeddings_1536` / `embeddings_384`
- Do NOT add a single `confidence` column — spec requires both `confidence_base` AND `confidence`
- Do NOT use TypeScript ENUM — types are `text` columns
- Do NOT omit `team_id` — federation-ready from day one
- Do NOT import from `@/lib/core` or any outer layer inside `src/lib/nebula/`
- Do NOT compute embeddings inside Nebula — accept them as parameters; never call an embedding API
- Do NOT add domain cluster recompute logic — that is Phase 3
- Do NOT add the `#general` scope tag — it is forbidden (throws `NebulaError('DUPLICATE_SCOPE_TAG', ...)`)

**If drizzle-kit generate fails:** check that `DATABASE_URL` is set in `.env.local` and the Supabase project is reachable. The `--dry-run` flag can generate SQL output without a live connection for inspection.

**If TypeScript compile errors occur in `sql\`...\`` template literals:** the raw SQL approach in `dedup.ts` and `embeddings.ts` uses `db.execute<T>(sql\`...\`)`. If the generic type isn't inferred correctly, use `const rows = await db.execute(sql\`...\`) as { ... }[]` with an explicit cast — document the cast with a comment.

**Assigned model recommendation:**
- Codex 5.3 is the correct choice for Phase 1 (Drizzle schema DDL + TypeScript interfaces + data access patterns)
- Phase 2 (Podium scoring algorithms, Conductor confidence formula) should be reviewed by Gemini 3.1 or Claude Sonnet 4.6 for the scoring logic before implementation
