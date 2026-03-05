# Skill: Nebula Schema Guardian

> **Trigger:** Any migration, schema change, or data model discussion
> **Purpose:** Enforce that the Nebula schema remains correct, federated, and unopinionated about outer layers
> **Best Model:** Sonnet 4.6 (schema diffs are small, deterministic checks) | **Codex** (code generation partner — run this skill to validate Codex-generated migration files)

---

## The One Question This Skill Answers

> *Does this schema change maintain Nebula integrity and federation-readiness?*

---

## Core Schema Principles

### 1. Learnings Are Tagged, Never Owned

```sql
-- ✅ CORRECT: Learnings exist independently, scopes are tags
learnings (id, user_id, team_id, content, type, confidence, ...)
learning_scopes (learning_id, scope)  -- Many-to-many relationship

-- ❌ WRONG: Learnings owned by projects (v1 anti-pattern)
project_learning_paths (id, project_id, content, ...)  -- FK creates ownership
```

### 2. Federation-Ready from Day One

Every core table MUST have:
- `user_id UUID NOT NULL` — individual ownership
- `team_id UUID` — nullable, for future team/enterprise federation

### 3. Projects Are Views, Not Containers

```sql
-- ✅ CORRECT: Projects store filters, not learnings
projects (
  id UUID,
  user_id UUID NOT NULL,
  team_id UUID,
  name TEXT,
  scope_filter JSONB,  -- {"include": ["#python"], "exclude": ["#personal"]}
  domain TEXT,
  settings JSONB
)

-- ❌ WRONG: Projects own learnings
projects (id, ...) 
learnings (id, project_id REFERENCES projects, ...)  -- NO!
```

---

## Required Fields by Table

### `learnings` Table
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ | Primary key |
| `user_id` | UUID | ✅ | NOT NULL |
| `team_id` | UUID | ⬜ | Nullable, federation-ready |
| `content` | TEXT | ✅ | The learning itself |
| `type` | TEXT | ✅ | pattern, decision, invariant, anchor, character, etc. |
| `confidence_base` | FLOAT | ✅ | 0.0-1.0, default 0.5 — raw score; never modified by decay tick |
| `confidence` | FLOAT | ✅ | 0.0-1.0, default 0.5 — effective value; updated by nightly decay job. Invariant: `confidence ≤ confidence_base` |
| `created_at` | TIMESTAMP | ✅ | With timezone |
| `updated_at` | TIMESTAMP | ✅ | With timezone |
| `source_conversation_id` | UUID | ⬜ | Nullable, tracks origin |
| `extraction_method` | TEXT | ✅ | 'manual'\|'auto'\|'import' |
| `usage_count` | INTEGER | ✅ | Default 0, increment on injection |
| `last_used_at` | TIMESTAMP | ⬜ | Nullable, tracks recency |
| `pinned_at` | TIMESTAMP | ⬜ | Nullable — Conductor cannot touch if set |
| `muted_at` | TIMESTAMP | ⬜ | Nullable — Podium never injects if set |

> ⚠️ **Embeddings live in separate typed tables, NOT on `learnings` directly.** Mixing vector dimensions in a single column corrupts cosine similarity in pgvector. The v2 schema uses two tables:

### `embeddings_1536` Table (cloud, high-quality)
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `learning_id` | UUID | ✅ | PK + FK to learnings ON DELETE CASCADE |
| `embedding` | VECTOR(1536) | ✅ | OpenAI `text-embedding-3-small` or equivalent |
| `model_name` | TEXT | ✅ | Records which model produced this embedding |
| `created_at` | TIMESTAMP | ✅ | With timezone |

### `embeddings_384` Table (local, sovereignty-safe)
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `learning_id` | UUID | ✅ | PK + FK to learnings ON DELETE CASCADE |
| `embedding` | VECTOR(384) | ✅ | `all-MiniLM-L6-v2` or `nomic-embed-text-v1.5` |
| `model_name` | TEXT | ✅ | Records which model produced this embedding |
| `created_at` | TIMESTAMP | ✅ | With timezone |

Podium query priority: `embeddings_1536` → `embeddings_384` → scope/recency only. A fully local user gets semantic search via the 384 table — no cloud required.

### `learning_scopes` Table
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `learning_id` | UUID | ✅ | FK to learnings |
| `scope` | TEXT | ✅ | Tag string, e.g., '#python', '#trading' |
| PRIMARY KEY | | | (learning_id, scope) |

### `learning_links` Table
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ | Primary key |
| `source_id` | UUID | ✅ | FK to learnings |
| `target_id` | UUID | ✅ | FK to learnings |
| `link_type` | TEXT | ✅ | 'related', 'supports', 'contradicts', 'supersedes' |
| `strength` | FLOAT | ✅ | 0.0-1.0, default 0.5 |
| `created_at` | TIMESTAMP | ✅ | With timezone |

### `cooccurrence` Table
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `learning_a` | UUID | ✅ | FK to learnings |
| `learning_b` | UUID | ✅ | FK to learnings |
| `count` | INTEGER | ✅ | Default 1 |
| `last_seen` | TIMESTAMP | ✅ | With timezone |
| PRIMARY KEY | | | (learning_a, learning_b) |

### `feedback` Table
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ | Primary key |
| `user_id` | UUID | ✅ | NOT NULL |
| `learning_id` | UUID | ⬜ | FK to learnings, nullable for conversation-level feedback |
| `conversation_id` | UUID | ⬜ | Nullable |
| `injection_id` | UUID | ⬜ | Links to audit log entry |
| `signal` | TEXT | ✅ | 'positive', 'negative', 'none' |
| `source` | TEXT | ✅ | 'explicit', 'implicit', 'conductor' |
| `processed` | BOOLEAN | ✅ | Default FALSE |
| `created_at` | TIMESTAMP | ✅ | With timezone |

### `projects` Table (UI Layer, Not Nebula Core)
| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | UUID | ✅ | Primary key |
| `user_id` | UUID | ✅ | NOT NULL |
| `team_id` | UUID | ⬜ | Nullable |
| `name` | TEXT | ✅ | Display name |
| `scope_filter` | JSONB | ✅ | Filter definition |
| `domain` | TEXT | ⬜ | 'writing', 'coding', 'research', etc. |
| `settings` | JSONB | ⬜ | Domain-specific config |
| `created_at` | TIMESTAMP | ✅ | With timezone |

---

## Forbidden Patterns

### ❌ No FK from Learnings to Projects
```sql
-- FORBIDDEN
ALTER TABLE learnings ADD COLUMN project_id UUID REFERENCES projects(id);
```

### ❌ No Hardcoded Types as Enums
```sql
-- FORBIDDEN: Types will expand with domains
CREATE TYPE learning_type AS ENUM ('pattern', 'decision', ...);

-- ALLOWED: TEXT column, validation in application layer
type TEXT NOT NULL  -- 'pattern', 'decision', 'character', etc.
```

### ❌ No Nullable user_id on Core Tables
```sql
-- FORBIDDEN
CREATE TABLE learnings (
  user_id UUID,  -- Missing NOT NULL
  ...
);
```

### ❌ No Embedding Column on `learnings` Directly
```sql
-- FORBIDDEN: v1 pattern — single embedding column on learnings
ALTER TABLE learnings ADD COLUMN embedding VECTOR(1536);

-- REQUIRED: Embeddings in separate typed tables
-- embeddings_1536 and embeddings_384 with their own ivfflat indexes
```

### ❌ No Deferred Embedding Computation
```
-- FORBIDDEN: Creating a learning with no embedding rows
-- Application layer must compute embedding and insert into the appropriate
-- embeddings_1536 or embeddings_384 table before the learning is queryable.
```

### ❌ No Cross-Lens Access Without Explicit Flag
```sql
-- FORBIDDEN: Retrieving learnings from outside the caller's scope without the opt-in flag
SELECT * FROM learnings WHERE user_id = $1;  -- Bypasses scope filter

-- REQUIRED: All queries go through ScopeFilter + allowCrossLens check
-- If allowCrossLens = false (default), scope tags must intersect the project's scope_filter
-- Cross-lens access must be logged in injection_audit.reason = 'cross-lens'
```

---

## Migration Naming Convention

```
NNNN_snake_case_description.sql

Examples:
0001_create_learnings_table.sql
0002_create_learning_scopes_table.sql
0003_add_team_id_to_learnings.sql
0004_create_cooccurrence_table.sql
```

---

## Compliance Checklist

Run this checklist against every schema change:

### 1. Federation Check
```
□ Does every new table have user_id NOT NULL?
□ Does every new table have team_id (nullable)?
□ Are there any FKs that would break multi-tenant isolation?
```

### 2. Ownership Check
```
□ Is there any new FK from learnings → projects?
□ Is there any new FK from learnings → any outer layer table?
□ Are learnings still tag-based (via learning_scopes)?
```

### 3. Required Fields Check
```
□ Does learnings have all required columns (including confidence_base AND confidence)?
□ Is embedding NOT on learnings directly? (must use embeddings_1536 / embeddings_384 tables)
□ Do embeddings_1536 and embeddings_384 tables exist with correct FK to learnings?
□ Are timestamps WITH TIME ZONE?
□ Is write-time dedup implemented in createLearning() path (Phase 1b check)?
```

### 4. Type Safety Check
```
□ Are types stored as TEXT (not ENUM)?
□ Is confidence stored as FLOAT with 0.0-1.0 range?
□ Are IDs stored as UUID?
```

### 5. Index Check
```
□ Is there an index on learnings(user_id)?
□ Is there an index on learnings(team_id) WHERE team_id IS NOT NULL?
□ Is there an ivfflat index on embeddings_1536(embedding)?
□ Is there an ivfflat index on embeddings_384(embedding)?
□ Is there NO vector index on learnings directly? (must be on the typed embedding tables)
□ Is there an index on learning_scopes(scope)?
□ Note: lists = 100 in ivfflat is correct for ~10K rows. Flag if corpus grows past 50K without reindex.
```

### 6. Cross-Lens Safety Check
```
□ Does searchByEmbedding accept an allowCrossLens flag (default false)?
□ Is cross-lens access gated on project.settings.crossLensAccess?
□ Are cross-lens retrievals logged in injection_audit with reason = 'cross-lens'?
```

---

## Output Format

When reviewing schema changes, return:

```markdown
## Nebula Schema Guardian Verdict

**Migration:** `0005_add_category_to_learnings.sql`

### Federation Check
| Table | user_id NOT NULL | team_id nullable | Verdict |
|-------|------------------|------------------|---------|
| learnings | ✅ | ✅ | PASS |

### Ownership Check
| Check | Verdict |
|-------|---------|
| No FK learnings → projects | ✅ PASS |
| Learnings use scope tags | ✅ PASS |

### Required Fields Check
| Field | Present | Verdict |
|-------|---------|---------|
| embedding VECTOR(1536) | ✅ | PASS |
| extraction_method | ✅ | PASS |

### Overall: ✅ PASS

**Notes:**
- Migration adds `category` column as TEXT (not ENUM) ✅
- No breaking changes to core schema
```

---

## v1 Anti-Patterns This Skill Prevents

| v1 Problem | What Went Wrong | Guardian Prevention |
|------------|-----------------|---------------------|
| `project_learning_paths` | Projects owned learnings | FK check forbids learnings → projects |
| Missing `team_id` | No federation path | Required field check |
| Type as ENUM | Couldn't add writing types | TEXT requirement |
| Deferred embeddings | Latency on first query | Embedding required at insert |
| No `usage_count` tracking | Couldn't measure learning value | Required field check |

---

## Success Criteria

A schema passes Nebula Schema Guardian when:
- Zero FK violations (learnings never reference projects)
- All core tables are federation-ready
- All required fields present (including `confidence_base` and `confidence` as separate columns)
- Types stored as TEXT, not ENUM
- Embeddings in `embeddings_1536` and `embeddings_384` typed tables, NOT on `learnings`
- Proper ivfflat indexes on each embedding table
- Write-time dedup implemented in `createLearning` path
- Cross-lens access gated and logged

---

## Codex Partner Notes

This skill validates Codex-generated migration files and Nebula layer TypeScript. Run before merging any `drizzle/` SQL or `src/lib/nebula/` changes.

**Common Codex patterns to watch for:**
- Codex often adds `embedding VECTOR(1536)` directly on `learnings` (v1 pattern) — must use typed tables
- Codex may generate a single `confidence` column — spec requires both `confidence_base` and `confidence`
- Codex may use `TEXT CHECK (type IN (...))` constraint — forbidden; types must be plain TEXT
- Codex may omit `team_id` as "not needed yet" — required from day one for federation
- Codex may generate bare `SELECT * FROM learnings WHERE user_id = $1` queries bypassing scope filters — flag as cross-lens violation
