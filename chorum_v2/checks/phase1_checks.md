# Phase 1 Check Report

Date: 2026-02-22
Skill used: `nebula-schema-guardian`

## Status
- Phase 1 code implementation: COMPLETE
- Build: PASS (`npx next build`)
- Migration generation: PASS (`drizzle/0001_nebula_core.sql` created/amended)
- Migration apply: BLOCKED (no `.env.local` / `DATABASE_URL`)

## Deliverables
- Schema implemented: `src/db/schema.ts` (14 exported `pgTable` definitions)
- Migration implemented: `drizzle/0001_nebula_core.sql`
- Nebula layer implemented (13 files):
  - `src/lib/nebula/errors.ts`
  - `src/lib/nebula/types.ts`
  - `src/lib/nebula/interface.ts`
  - `src/lib/nebula/dedup.ts`
  - `src/lib/nebula/queries.ts`
  - `src/lib/nebula/embeddings.ts`
  - `src/lib/nebula/links.ts`
  - `src/lib/nebula/cooccurrence.ts`
  - `src/lib/nebula/feedback.ts`
  - `src/lib/nebula/audit.ts`
  - `src/lib/nebula/tokens.ts`
  - `src/lib/nebula/impl.ts`
  - `src/lib/nebula/index.ts`

## Phase 0 Carry-Forward Fixes Applied
- `docs/specs/LAYER_CONTRACTS.md`: added `## Interface(s)`
- `docs/specs/NEBULA_SCHEMA_SPEC.md`: added `## Interface(s)`
- `docs/specs/DOMAIN_SEEDS_SPEC.md`: added `## Error Handling` and `## Interface(s)`

## Nebula Schema Guardian Verdict

### 1. Federation Check
PASS
- Core user-scoped tables include `user_id NOT NULL` in `src/db/schema.ts`:
  - `learnings`, `feedback`, `projects`, `injection_audit`, `conductor_queue`, `conductor_proposals`, `api_tokens`, `domain_clusters`
- `team_id` present where required by spec (`learnings`, `projects`)

### 2. Ownership Check
PASS
- No FK from `learnings` to `projects`
- Learnings remain tag-based via `learning_scopes`

### 3. Required Fields Check
PASS
- `learnings` includes both `confidence_base` and `confidence`
- Embeddings stored in typed tables (`embeddings_1536`, `embeddings_384`), not on `learnings`
- Write-time semantic dedup implemented in `createLearning` path (`findNearDuplicate`, threshold `0.85`)

### 4. Type Safety Check
PASS
- IDs are UUID
- Types are TEXT (no ENUM)
- Confidence fields are `double precision` with checks

### 5. Index Check
PASS
- Required indexes present in schema/migration
- ANN indexes present:
  - `embeddings_1536_ann_idx`
  - `embeddings_384_ann_idx`

### 6. Cross-Lens Safety Check
PASS
- `searchByEmbedding(..., allowCrossLens?: boolean)` in `src/lib/nebula/interface.ts`
- Guard enforced when `allowCrossLens` is false in `src/lib/nebula/embeddings.ts`
- Interface contract documents cross-lens audit requirement

## Layer Guardian (for Nebula files)
PASS
- No imports from outer layers (`@/lib/core`, `@/lib/customization`, `@/lib/agents`, `@/app`) under `src/lib/nebula/`

## Migration Notes
`drizzle/0001_nebula_core.sql` includes:
- `CREATE EXTENSION IF NOT EXISTS vector;`
- Added auth FKs:
  - `learnings_user_id_fkey`
  - `feedback_user_id_fkey`
  - `projects_user_id_fkey`
  - `injection_audit_user_id_fkey`
  - `api_tokens_user_id_fkey`
  - `domain_clusters_user_id_fkey`
- Added ANN ivfflat indexes for both embedding tables

## Blockers
- `npx drizzle-kit migrate` fails until `.env.local` is present with real `DATABASE_URL`.
  - Current error: `Please provide required params for Postgres driver: url: undefined`

## Changelog
- Added Phase 1 entry under `[2.0.0-alpha.1]` in `CHANGELOG.md`
