# Changelog

## [2.0.0-alpha.6] — Audit Remediation

### Security
- **CRITICAL:** Row-Level Security enabled on all 18 public tables with 53 policies
  - User-owned tables: `auth.uid() = user_id` on SELECT/INSERT/UPDATE/DELETE
  - FK-dependent tables (embeddings, scopes, links, cooccurrence): ownership verified via parent learning
  - System tables (`domain_seeds`): read-only for authenticated role
  - Note: Drizzle ORM uses `postgres` user (table owner, bypasses RLS) — policies are defense-in-depth for PostgREST/anon-key paths

### Fixed
- TypeScript strict-mode build error: added `outline` variant to `HyggeButton`
- `vercel.json` missing `/api/cron/embedding-backfill` — new learnings now get embeddings
- MCP API version bumped to `2.0.0-alpha.5`
- Stale `tsc_errors*.txt` files removed

### Added
- `ShellErrorBoundary` wrapping all Shell page content — catches React render errors gracefully
- In-memory per-user rate limiter (60 req/min) on all Shell server actions
- `conversations.updated_at` column + migration `0009` — conversation lists sort by last activity
- Replaced ~15 `any` types in Shell actions with proper types (`LearningType`, `AuthContext`, etc.)

## [2.0.0-alpha.5] — Phase 5: Shell (Layer 4)

### Added
- Hygge Brutalist design system — 7 reusable components (`HyggeButton`, `HyggeCard`, `HyggeInput`, `HyggeModal`, `HyggeTabs`, `HyggeToast`, `HyggeToggle`)
- Chat page with streaming messages, inline injected-context panel, and per-item 👍/👎 feedback
- Projects drawer (left) with CRUD, conversation grouping, project-scoped chat sessions
- Agent drawer (right) with persona browser, system personas, and custom persona creation via structured prompt builder
- Omnibar with file attachments, provider selector, keyboard shortcuts
- Settings page: Providers, Personas, Memory, Account tabs
- Settings: per-task provider assignment (judge, embedding, extraction, chat) with daily token limits
- Settings: end-of-session judge toggle, auto-extract/auto-inject/conductor-actions toggles
- Settings: data export (JSON) and import (JSON)
- Settings: API token creation, listing, and revocation UI
- Conductor Inbox page — approve/reject Conductor proposals with rationale display
- Injection Audit page — timeline grouped by conversation with score bars and tier badges
- Knowledge page — learning grid with type badges, scope tags, NebulaCharts stats, template import
- `ShellSidebar` with navigation to chat, knowledge, inbox, audit, settings
- `CommandPalette` (Ctrl+K) keyboard shortcuts system
- `MessageContent` component with markdown rendering
- Shell server actions in `src/lib/shell/actions.ts` — 30+ actions bridging UI to layers 0-3

### Architecture
- All Shell pages are stateless — state lives in layers below
- Server actions use NextAuth session for auth context
- Layer 4 calls Layer 3 (AgentInterface) and Layer 2 (ChorumClient) only via published interfaces

## [2.0.0-alpha.4+remediation] — Phase 0–4 Audit Remediation

### Security Fixes
- **CRITICAL:** `customization/auth.ts` — replaced SHA-256 token verification with
  `nebula.validateApiToken(plainToken)` (bcrypt). Direct DB import from Layer 2 removed.
  All external MCP Bearer token authentication was broken; now fixed.

### Fixed
- Cron endpoints (`/api/cron/decay`, `/api/cron/zombie-recovery`) now return 401 (fail-secure)
  instead of 500 when `CRON_SECRET` is not configured

### Added
- `/api/cron/process-queue` — Conductor queue processor (every 2 min), drains
  `conductor_queue` `signal_processing` jobs through `ConductorImpl.submitSignal()`;
  max 3 attempts before permanent failure; zombie items reset by existing zombie-recovery cron
- `vercel.json` — scheduled the new queue processor cron

### Spec Sync
- `docs/specs/LAYER_CONTRACTS.md` — `NebulaInterface.searchByEmbedding`: added `userId`
  as first parameter (security amendment from Phase 1b)
- `docs/specs/LAYER_CONTRACTS.md` — `NebulaInterface`: added `incrementUsageCount(ids)` (Phase 2 amendment)
- `docs/specs/LAYER_CONTRACTS.md` — `BinaryStarInterface`: added `createProposal()` and
  `maybeFireSessionJudge()` (Phase 3 amendments already implemented)



### Added
- Next.js 15 scaffold with TypeScript strict mode, Drizzle ORM, Supabase Auth
- Five pre-implementation spec documents in `docs/specs/`
- Directory structure for all layers (stubs only — no implementation)
- Guardian skills in `skills/` (5 skills)
- `.env.local.example` with all required variables documented

### Architecture decisions locked
- Embedding architecture: two typed tables (`embeddings_1536`, `embeddings_384`) — not a column on `learnings`
- Signal policy: explicit thumbs only auto-applied in v2.0; heuristic/inaction stored as soft priors
- End-of-session judge: disabled by default; opt-in at Personal tier
- Confidence formula: `consistency_factor` (not `decay_factor`) — signal-history measure, not temporal decay
- Domain: emergent from scope tags; no `general` fallback; `DomainSignal.primary` is `string | null`
- Cross-lens access: gated by `allowCrossLens` flag (default false); audit-logged

## [2.0.0-alpha.1] — Phase 1: Nebula (Layer 0)

## [2.0.0-alpha.2] — Phase 2: Binary Star Core (Layer 1)

### Added
- Podium: tiered context injection with intent-adaptive weight profiles (7 intents)
- Podium: attention density selection (score / tokenCount) over token maximization
- Podium: domain-aware type weights (coding, writing, trading, research; null = all-equal)
- Podium: Tier 1/2 pre-compiled in-memory cache (TTL-based)
- Podium: full injection audit trail (included AND excluded candidates logged)
- Conductor: explicit signal auto-application path to confidence_base
- Conductor: heuristic + inaction signals stored-only (no auto-confidence change — v2.0 policy)
- Conductor: end-of-session judge stub (disabled by default; endOfSessionJudgeEnabled = false)
- Conductor: ConductorProposals for large deltas (> 0.10) and judge verdicts
- Conductor: guardrails (no delete, no unverified > 0.7, no pinned override)
- Conductor: zombie recovery (resets queue items stuck > 10 min; 5-min cron schedule)
- `decay.ts`: `computeDecayedConfidence()` — nightly tick, single source of truth
- Test suite: 70 unit tests (Vitest) covering scorer, tiers, guardrails, decay, signals
- Migration `0002_user_settings.sql` — `user_settings` table (`end_of_session_judge_enabled`)
- Cron routes: `/api/cron/decay` (nightly 2AM), `/api/cron/zombie-recovery` (every 5 min)

### Fixed
- NebulaInterface extended: `incrementUsageCount(ids)` — atomic fire-and-forget
- Phase 1 usageCount increment pattern corrected (atomic SQL, not read-modify-write)
- Muted item injection guard: podium.ts now excludes mutedAt !== null before scoring loop + audit-logs as excluded with reason 'muted'

### Interface Changes
- `PodiumResult.auditLog` renamed to `auditEntries` (clearer name; inline type replaces named InjectionAuditEntry export)

### Architecture
- No imports between `podium/` and `conductor/` — they share `NebulaInterface` only
- `BinaryStarInterface` is the single export from `src/lib/core/` for Layer 2

## [2.0.0-alpha.3] — Phase 3: Customization Layer (Layer 2)

### Added
- MCP endpoint at `/api/mcp` — JSON-RPC 2.0 over HTTP POST
- 4 core MCP tools: `read_nebula`, `get_context`, `inject_learning`, `submit_feedback`
- Bearer token authentication with bcrypt verification + scoped permissions
- NextAuth session fallback for co-located Shell
- Ownership enforcement: token-holder can only access own data
- ChorumClient transport adapter (`LocalChorumClient` + `MCPChorumClient`)
- Human-in-the-loop: auto/import writes create ConductorProposal; manual writes are direct
- Domain seed management: CRUD for `domain_seeds`, read-only view of `domain_clusters`
- 3 system domain seeds: coding, writing, trading
- Per-user customization config in `user_settings.customization` JSONB
- Configurable: `halfLifeOverrides`, `confidenceFloorOverrides`, `qualityThreshold`
- Migration `0003_customization.sql` — customization JSONB column on user_settings
- Seed data migration `0003b_seed_domains.sql` — 3 system domain seeds
- GET `/api/mcp` health check endpoint

### Architecture
- ChorumClient is the single transport abstraction for all Shell/external access
- Handlers are shared logic — both Local and MCP clients call the same functions
- Layer 2 imports only from public interfaces of Layer 0 (Nebula) and Layer 1 (BinaryStar)
- BinaryStarInterface extended with `createProposal()` for Layer 2 HITL workflow

### Addendum (Active Memory Loop)
- Added conversation tracking (`conversations` table + session CRUD)
- MCP surface expanded to 7 tools: `start_session`, `read_nebula`, `get_context`, `inject_learning`, `submit_feedback`, `extract_learnings`, `end_session`
- Added MCP behavioral resources: tool descriptions, `tools/list`, `prompts/list`, `resources/list`, `resources/read`
- Added scope auto-detection fallback in `inject_learning`
- Added project auto-association from scope overlap
- Added server-side extraction pipeline with provider-backed extraction call path and HITL injection

## [2.0.0-alpha.4] — Phase 4: Agent Layer (Layer 3)

### Added
- Provider system in `src/lib/providers/` (utility-only, no Chorum imports)
- Per-user provider configuration with AES-256-GCM encrypted API keys
- Persona system with system + user-defined personas
- Agent routing layer (`estimateComplexity`, persona/provider/model selection)
- AgentInterface implementation with sync + streaming chat
- Tool access control helpers for persona tool restrictions
- Extraction provider wiring via provider call path (Phase 3 debt addressed)
- Embedding backfill cron route at `/api/cron/embedding-backfill`
- Migration `0005_agent_layer.sql` for `provider_configs` and `personas`
- Seed migration `0005b_seed_personas.sql` for system personas

### Architecture
- Layer 3 imports only from Layers 0-2 and provider utility
- Providers remain standalone transport adapters
- Routing is automatic; explicit persona override supported via `agentId`

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
