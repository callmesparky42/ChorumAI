# Nebula Schema Specification

**Phase:** 0 (pre-implementation) → implements in Phase 1
**Status:** Locked
**Migration:** `drizzle/0001_nebula_core.sql` (written in Phase 1)
**Guardian:** `nebula-schema-guardian`

---

## Purpose

Define the complete database schema for the Zettelkasten (Layer 0). This is the persistent substrate — everything else reads from and writes to these tables. This spec is the source of truth for migration `0001`. Do not write the migration until this spec is reviewed and committed.

## Non-Goals

- Does not specify Podium or Conductor query logic (see their specs)
- Does not specify domain-specific extraction behavior (see DOMAIN_SEEDS_SPEC.md)
- Does not specify MCP or API surface (see Phase 3)
- Does not specify decay formulas (see PODIUM_INTERFACE_SPEC.md)

---

## Design Principles

1. **Learnings are tagged, never owned.** No FK from `learnings` to `projects`.
2. **Federation from day one.** Every table has `user_id NOT NULL` and `team_id UUID` (nullable).
3. **Embeddings in typed tables.** `learnings` has no embedding column. Two separate tables: `embeddings_1536` (cloud) and `embeddings_384` (local/sovereign). Mixing dimensions in a single column corrupts cosine similarity in pgvector.
4. **Types as TEXT.** Never ENUM. Domain types expand; ENUMs require migrations.
5. **Confidence split.** `confidence_base` is set by Conductor from feedback signals; never touched by the decay tick. `confidence` is the effective value updated nightly by the decay job. Invariant: `confidence ≤ confidence_base`.
6. **Domain is emergent.** No domain column on learnings. Domain clusters form from scope tag co-occurrence. No `general` fallback.

---

## Tables

### `learnings` — Core learning node

```sql
CREATE TABLE learnings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  team_id               UUID,                       -- federation: nullable now, required in 3.0
  content               TEXT NOT NULL,
  type                  TEXT NOT NULL,              -- see type registry
  confidence_base       FLOAT NOT NULL DEFAULT 0.5, -- Conductor writes; never touched by decay tick
  confidence            FLOAT NOT NULL DEFAULT 0.5, -- effective value; nightly decay job updates this
  extraction_method     TEXT NOT NULL,              -- 'manual' | 'auto' | 'import'
  source_conversation_id UUID,
  pinned_at             TIMESTAMPTZ,                -- Conductor cannot touch if non-null
  muted_at              TIMESTAMPTZ,                -- Podium never injects if non-null
  usage_count           INTEGER NOT NULL DEFAULT 0,
  last_used_at          TIMESTAMPTZ,
  promoted_at           TIMESTAMPTZ,                -- usage_count >= 10 → guaranteed Tier 1/2
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT confidence_invariant CHECK (confidence <= confidence_base),
  CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT confidence_base_range CHECK (confidence_base >= 0 AND confidence_base <= 1)
);
```

### `embeddings_1536` — Cloud embeddings

```sql
CREATE TABLE embeddings_1536 (
  learning_id           UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding             VECTOR(1536) NOT NULL,
  model_name            TEXT NOT NULL,              -- 'text-embedding-3-small' | 'text-embedding-3-large'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `embeddings_384` — Local embeddings (sovereignty-safe)

```sql
CREATE TABLE embeddings_384 (
  learning_id           UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding             VECTOR(384) NOT NULL,
  model_name            TEXT NOT NULL,              -- 'all-MiniLM-L6-v2' | 'nomic-embed-text-v1.5'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `learning_scopes` — Scope tags (many-to-many)

```sql
CREATE TABLE learning_scopes (
  learning_id           UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  scope                 TEXT NOT NULL,              -- '#python', '#trading', '#fiction'
  PRIMARY KEY (learning_id, scope)
);
```

### `learning_links` — Zettelkasten edges

```sql
CREATE TABLE learning_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  target_id             UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  link_type             TEXT NOT NULL,              -- 'related'|'supports'|'contradicts'|'supersedes'
  strength              FLOAT NOT NULL DEFAULT 0.5,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_link CHECK (source_id != target_id)
);
```

### `cooccurrence` — Usage cohort tracking

```sql
CREATE TABLE cooccurrence (
  learning_a            UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  learning_b            UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  count                 INTEGER NOT NULL DEFAULT 1,
  positive_count        INTEGER NOT NULL DEFAULT 0,
  negative_count        INTEGER NOT NULL DEFAULT 0,
  last_seen             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learning_a, learning_b),
  CONSTRAINT ordered_pair CHECK (learning_a < learning_b)
);
```

### `feedback` — All feedback signals

```sql
CREATE TABLE feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  learning_id           UUID REFERENCES learnings ON DELETE CASCADE,
  conversation_id       UUID,
  injection_id          UUID,                       -- links to injection_audit.id
  signal                TEXT NOT NULL,              -- 'positive' | 'negative' | 'none'
  source                TEXT NOT NULL,              -- 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'
  processed             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `projects` — UI-level saved scope filters

```sql
CREATE TABLE projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  team_id               UUID,
  name                  TEXT NOT NULL,
  scope_filter          JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}',
  domain_cluster_id     UUID,                       -- FK added after domain_clusters exists
  cross_lens_access     BOOLEAN NOT NULL DEFAULT FALSE, -- must be TRUE for allowCrossLens queries
  settings              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `domain_seeds` — Type/weight hints for known domain signals

```sql
CREATE TABLE domain_seeds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                 TEXT NOT NULL UNIQUE,       -- 'coding', 'writing', 'trading', etc.
  signal_keywords       JSONB NOT NULL,             -- terms that suggest this domain
  preferred_types       JSONB NOT NULL,             -- type→weight hints
  is_system             BOOLEAN NOT NULL DEFAULT FALSE -- TRUE = shipped with app; FALSE = learned
);
```

### `domain_clusters` — Emergent clusters from scope tag co-occurrence

```sql
CREATE TABLE domain_clusters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  label                 TEXT NOT NULL,
  scope_tags            JSONB NOT NULL,             -- ['#python', '#algorithms']
  centroid_1536         VECTOR(1536),               -- NULL if user is local-only
  centroid_384          VECTOR(384),                -- NULL if no local model configured
  confidence            FLOAT NOT NULL DEFAULT 0.5,
  learning_count        INTEGER NOT NULL DEFAULT 0,
  last_recomputed       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `injection_audit` — Full injection decision log

```sql
CREATE TABLE injection_audit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  conversation_id       UUID,
  learning_id           UUID REFERENCES learnings ON DELETE SET NULL,
  included              BOOLEAN NOT NULL,
  score                 FLOAT NOT NULL,
  reason                TEXT,
  exclude_reason        TEXT,
  tier_used             INTEGER NOT NULL,           -- 1 | 2 | 3
  tokens_used           INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `conductor_queue` — Background job queue

```sql
CREATE TABLE conductor_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  type                  TEXT NOT NULL,              -- 'signal_processing' | 'lm_judge' | 'compaction'
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'completed'|'failed'
  attempts              INTEGER NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,               -- zombie: reset if locked > 10 min
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `conductor_proposals` — Pending confidence adjustments

```sql
CREATE TABLE conductor_proposals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  learning_id           UUID REFERENCES learnings ON DELETE CASCADE,
  type                  TEXT NOT NULL,              -- 'promote'|'demote'|'archive'|'merge'
  confidence_delta      FLOAT NOT NULL,
  rationale             TEXT NOT NULL,
  requires_approval     BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'expired'
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `api_tokens` — MCP Bearer tokens

```sql
CREATE TABLE api_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  hashed_token          TEXT NOT NULL UNIQUE,       -- bcrypt hash; plain token shown once at creation
  scopes                JSONB NOT NULL DEFAULT '[]',
  last_used_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Type Registry

TEXT values for the `type` column. Never an ENUM.

**Core types:** `invariant` | `pattern` | `decision` | `antipattern` | `golden_path` | `anchor`
**Writing types:** `character` | `setting` | `plot_thread` | `voice` | `world_rule`

New types are added by inserting new values — no migration required.

---

## Indexes

```sql
-- learnings
CREATE INDEX learnings_user_id_idx ON learnings(user_id);
CREATE INDEX learnings_team_id_idx ON learnings(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX learnings_confidence_idx ON learnings(confidence) WHERE confidence > 0.2;
CREATE INDEX learnings_type_idx ON learnings(type);

-- ANN indexes — separate per dimension (lists = 100 correct for ~10K rows)
-- See migration notes for scaling: lists ≈ sqrt(N); HNSW migration path available at >500K rows
CREATE INDEX embeddings_1536_ann_idx ON embeddings_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX embeddings_384_ann_idx  ON embeddings_384  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- scopes + feedback
CREATE INDEX learning_scopes_scope_idx      ON learning_scopes(scope);
CREATE INDEX learning_scopes_learning_idx   ON learning_scopes(learning_id);
CREATE INDEX feedback_user_unprocessed_idx  ON feedback(user_id, processed) WHERE processed = FALSE;

-- queue + audit
CREATE INDEX conductor_queue_pending_idx    ON conductor_queue(user_id, status) WHERE status = 'pending';
CREATE INDEX conductor_queue_locked_idx     ON conductor_queue(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX injection_audit_user_time_idx  ON injection_audit(user_id, created_at DESC);
CREATE INDEX api_tokens_active_idx          ON api_tokens(hashed_token) WHERE revoked_at IS NULL;
```

---

## Invariants

1. No FK from `learnings` to `projects`. Learnings exist independently; projects are scope filters.
2. `confidence ≤ confidence_base` enforced by CHECK constraint on `learnings`.
3. `cooccurrence` primary key is ordered pair (`learning_a < learning_b`) — no duplicates.
4. `learning_links` has a self-link prevention CHECK.
5. Embeddings are in separate tables. No embedding column on `learnings`.
6. pgvector extension must be enabled before migration: `CREATE EXTENSION IF NOT EXISTS vector;`

## Error Handling

- Insert failures on constraint violations should surface typed errors from the Nebula layer
- Dedup (write-time) should not throw on near-duplicate detection — merge silently and log

## Interface(s)

The Nebula layer's public interface is `NebulaInterface`, defined in `src/lib/nebula/interface.ts`
and specified in full in `docs/specs/LAYER_CONTRACTS.md` under "Layer 0 → Layer 1".
No other exports from `src/lib/nebula/` are part of the public contract.
## Testing Contract

- After Phase 1 migration: insert a learning, confirm confidence CHECK holds
- Insert two learnings with same `learning_a` and `learning_b` in cooccurrence — second insert should UPDATE count
- Confirm embeddings_1536 and embeddings_384 can each hold a learning_id without conflict
- `nebula-schema-guardian` checklist must pass fully

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| `project_learning_paths` FK to projects | `learning_scopes` tags; no FK to projects |
| Single `confidence` column | `confidence_base` + `confidence` split |
| Embedding column on learnings | Typed embedding tables |
| No `team_id` | Federation-ready from day one |
| Type as implied string | Type registry documented; TEXT enforced |
| Zombie queue with no recovery index | `conductor_queue_locked_idx` for recovery |
```

---