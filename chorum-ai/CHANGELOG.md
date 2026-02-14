# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Domain Signal Engine (Phase 1)**: Introduced keyword-based domain inference with project-level aggregation, caching, and storage (`src/lib/chorum/domainSignal.ts`).
- **Project Domain Signal Storage**: Added `domain_signal` JSONB field to projects, with migration `drizzle/0026_domain_signal.sql`.
- **Domain Signal Recompute Hook**: Chat route now periodically recomputes the project domain signal (every ~20 messages) without blocking responses (`src/app/api/chat/route.ts`).
- **Domain Signal API + MCP Tool**: New `/api/conductor/domain` endpoint and MCP tool to fetch or recompute inferred project domains (`src/app/api/conductor/domain/route.ts`, `src/app/api/mcp/route.ts`, `src/lib/mcp/tools/get-domain-signal.ts`).
- **Import-and-Analyze Pipeline (Phase 3)**: Added foreign export parsers, bulk analysis pipeline with rate limiting, and storage helpers (`src/lib/portability/parsers.ts`, `src/lib/portability/analyzeImport.ts`, `src/lib/portability/store.ts`).
- **Import-and-Analyze API + MCP Tool**: New `/api/import/analyze` endpoint and MCP tool for importing external conversation history and extracting learnings (`src/app/api/import/analyze/route.ts`, `src/app/api/mcp/route.ts`, `src/lib/mcp/tools/import-analyze.ts`).
- **Cheapest Provider Resolver**: Shared helper for selecting the cheapest active provider for bulk analysis (`src/lib/providers/cheapest.ts`).
- **Migration UI (Phase 4)**: Replaced the placeholder migration page with a functional import interface (`src/app/helpmemigrate/page.tsx`).
- **Domain Signal Settings UI**: Added project domain indicator with recompute support to Memory & Learning settings (`src/app/settings/page.tsx`).
- **Domain Context in Conductor Trace**: Injected domain context into the Conductor trace header (`src/components/ConductorTrace.tsx`).

### Changed
- **Domain-Adaptive Extraction**: Learning extraction prompt now adapts to inferred or user-focused domains, avoiding code-centric bias (`src/lib/learning/analyzer.ts`).
- **Classifier Domain Detection**: Query classifier now leverages domain keywords to expand domain detection beyond code (`src/lib/chorum/classifier.ts`).
- **Domain-Aware Injection**: Memory injection scoring now uses inferred project domains when explicit focus domains are unset (`src/lib/learning/injector.ts`).
- **Settings UI (Hygge Pass)**: Restyled MCP Integration, MCP Servers, Web Search, and Conductor settings plus pending learnings to the hygge brutalist system (`src/components/settings/McpSettings.tsx`, `src/components/settings/McpServersSettings.tsx`, `src/components/settings/SearchSettings.tsx`, `src/components/settings/ConductorSettings.tsx`, `src/components/PendingLearnings.tsx`, `src/app/settings/page.tsx`).

## [Unreleased]

### Fixed
- **Conductor Import Triage (Phase 0)**: Fixed critical failure mode where large conversation imports were concatenated into single massive strings.
  - Implemented windowed chunking (3-turn max) in `src/lib/portability/analyzeImport.ts` to bound context size.
  - Added zombie recovery to `src/lib/learning/queue.ts`: items stuck in `processing` >10 mins are automatically reset to `pending`.
  - Cleared 6 stuck "zombie" items from the learning queue.

### Added
- **Meaning Anchors (Phase 1)**: Added `anchor` learning type for capturing project identity, proper nouns, and terminology.
  - Implemented anchor extraction in `src/lib/learning/analyzer.ts` with dedicated prompt section.
  - Added infinite-decay configuration for anchors in `src/lib/chorum/relevance.ts` (identity facts never expire).
  - Anchors are now injected at the top of the context under "## Project Identity & Anchors".
- **Domain Signal Engine (Phase 1)**: Introduced keyword-based domain inference with project-level aggregation, caching, and storage (`src/lib/chorum/domainSignal.ts`).
- **Compaction Pipeline (Phase 2)**: Added semantic clustering engine to merge redundant learning items.
  - Implemented greedy clustering (0.85 cosine similarity thresh) in `src/lib/learning/compactor.ts`.
  - Added prototype selection (highest usage + recency) and merge-on-write logic.
  - New admin endpoint `POST /api/conductor/compact` to trigger compaction jobs.
- **Link Backfill Engine (Phase 3)**: Implemented graph bootstrapping from co-occurrence data.
  - Converting 10k+ co-occurrence observations into semantic `supports` links (`src/lib/learning/linker.ts`).
  - Adjusted promotion threshold from 10 to 3 uses to activate the compiled cache pipeline earlier.
  - New admin endpoint `POST /api/conductor/link/backfill` to trigger link generation.

### Added
- **Conductor's Podium**: User-facing control layer for the memory relevance engine.
  - **Pin/Mute Controls**: Force-include or permanently exclude specific learning items from context injection.
  - **Conductor Lens**: Adjustable budget multiplier (0.25x–2.0x) to control how much memory is injected per query.
  - **Focus Domains**: Priority scoring for selected knowledge domains (+15% boost for matching items).
  - **ConductorTrace Widget**: Collapsible per-message display showing which items were injected, with inline thumbs up/down feedback and pin/mute actions.
  - **ConductorSettings Panel**: New settings component with lens slider and domain picker.
  - New API routes: `/api/conductor/items`, `/api/conductor/feedback`, `/api/conductor/lens`, `/api/conductor/health`.
  - Schema migration: `0025_conductor_podium.sql` adding `pinned_at`, `muted_at`, `conductor_lens`, `focus_domains`, `conductor_detailed_view` columns.

## [1.1.5] - 2026-02-08

### Added
- **Expanded Debugging Intent Detection**: Added `trace`, `stack`, `exception`, `undefined`, `typeerror`, `null pointer`, `logs`, `breakpoint`, `segfault`, and `panic` as debugging keyword triggers, improving classification accuracy for bug-fixing workflows (`src/lib/chorum/classifier.ts`).
- **Co-occurrence Scoring**: Items that frequently co-occur with high-scoring seeds in positive-feedback contexts now receive a relevance bonus (up to +0.10), surfacing knowledge that consistently appears together (`src/lib/learning/injector.ts`, `src/lib/learning/cooccurrence.ts`).
- **Intent-Adaptive Score Thresholds**: Replaced hardcoded relevance thresholds (0.35/0.20) with per-intent lookup table — debugging uses lower thresholds (0.25/0.15) to cast a wider net, generation uses higher thresholds (0.40/0.20) for precision (`src/lib/chorum/relevance.ts`).
- **Confidence-Gated Injection**: `selectMemory()` now accepts the query intent and applies intent-specific minimum score thresholds before injecting items into context (`src/lib/chorum/relevance.ts`).
- **Promotion Pipeline**: High-usage learning items (≥10 retrievals) are automatically promoted to guarantee inclusion in Tier 1/2 compiled caches, bypassing decay filters (`src/lib/learning/compiler.ts`, `src/lib/learning/cache.ts`).
  - New `promotedAt` column on `project_learning_paths` table.
  - `promoteHighUsageItems()` runs automatically before cache recompilation.
  - Migration: `drizzle/0025_promotion_pipeline.sql`.
- **Dynamic Weight Shifting**: Relevance scoring weights now shift based on conversation signals beyond intent — deep conversations (>10 turns) boost recency, code-heavy queries boost domain matching, and history-referencing queries boost semantic similarity. Weights are re-normalized after shifting (`src/lib/chorum/relevance.ts`).

## [1.1.4] - 2026-02-07

### Added
- **Serper Search Integration**: Native internet search capability allowing LLMs (including local models like Ollama) to access real-time information via Serper API.
- **Web Search Settings**: New settings tab to configure Serper API key and toggle search functionality.
- **Search Observability**: Search usage metrics now included in chat response metadata.

### Improved
- **Settings UI**: Reorganized settings tabs for better navigation; added dedicated "Web Search" section.

## [0.2.2] - 2026-02-07

### Added
- **Semantic Deduplication**: Implemented consolidation-on-write to merge near-duplicates (>0.85 cosine similarity) instead of creating new entries, reducing corpus bloat (`src/lib/learning/analyzer.ts`).
- **Debugging Query Intent**: Added `'debugging'` intent with specialized weight profile (0.35 recency, 2.0x antipattern boost) to improve relevance during bug fixing (`src/lib/chorum/classifier.ts`, `src/lib/chorum/relevance.ts`).
- **Proportional Domain Scoring**: Replaced binary domain overlap with proportional Jaccard-like scoring (overlap / max size) to reward higher domain precision (`src/lib/chorum/relevance.ts`).
- **Golden Path Extraction**: Added `golden_path` as a first-class extraction category for capturing step-by-step procedures (`src/lib/learning/analyzer.ts`).
- **Decay-Aware Compilation**: Tier 1/2 compilers now strictly filter out items that have decayed below relevance threshold (`0.10`), ensuring caches reflect currently relevant knowledge (`src/lib/learning/compiler.ts`).

## [0.2.1] - 2026-02-07

### Fixed
- **Usage count never incremented**: The `usageCount` field on learning items was used as a relevance signal but never actually incremented, making the entire usage dimension dead weight. Added fire-and-forget `UPDATE ... SET usage_count = usage_count + 1` in `injectLearningContext()` for all selected items (`src/lib/learning/injector.ts`).
- **Tier 1/2 cache miss fallback could blast small models**: When a Tier 1 (8K context) or Tier 2 model had a cache miss, the fallback to the Tier 3 pipeline could assign a budget (e.g. 2,000 tokens) far exceeding what the model could afford (~500 tokens). Added budget clamping: `Math.min(budget.maxTokens, tierConfig.maxBudget)` on cache miss fallback (`src/lib/learning/injector.ts`).

## [0.2.0] - 2026-02-03

### Added
- **Tiered Context Compilation**: Pre-compiled context caches for small/medium models to avoid latency and context overflow.
  - Tier 1 "DNA Summary" for ≤16K models (max 6% of context window).
  - Tier 2 "Field Guide" for 16K–64K models (max 8% of context window).
  - Tier 3 "Full Dossier" for 64K+ models (existing dynamic pipeline).
  - New `selectInjectionTier()` in `src/lib/chorum/tiers.ts`.
  - New `LearningCompiler` in `src/lib/learning/compiler.ts` for Tier 1/2 pre-compilation.
  - New `learningContextCache` table and `src/lib/learning/cache.ts` for cache storage/retrieval.
- **Multi-Provider Embeddings**: Embedding generation falls back across providers (OpenAI → Google → Mistral → Ollama) so non-OpenAI users still get semantic scoring (`src/lib/chorum/embeddings.ts`).
- **Per-Type Decay Curves**: Replaced single 30-day exponential decay with type-specific half-lives — invariants never decay, decisions (365d), patterns (90d), golden paths (30d), antipatterns (14d) (`src/lib/chorum/relevance.ts`).
- **Dynamic Weight Profiles**: Relevance scoring weights now shift by query intent — debugging boosts recency, generation boosts patterns, analysis boosts decisions (`src/lib/chorum/relevance.ts`).
- **Logarithmic Usage Scoring**: Replaced linear `min(usageCount/10, 0.15)` with log curve that rewards initial usage but plateaus, signaling high-use items for promotion (`src/lib/chorum/relevance.ts`).
- **Context Window Field**: Added `contextWindow` column to `providerCredentials` for per-model tier selection (`src/lib/db/schema.ts`).
- **Learning Queue**: Background processing queue for learning extraction to avoid blocking chat responses (`src/lib/learning/queue.ts`).
- **Memory Documentation Site**: Added docs pages for memory system overview, learning types, relevance gating, and tiered context (`docs-site/pages/memory/`).
- **Memory Safety Layer**: Implemented "Deterministic Grounding" to prevent poison-pill memory injection.
  - Added `verifyReference` in `src/lib/learning/grounding.ts`.
  - Added `provenance` field to learning items for Source Tagging (conversation & message tracking).
  - Integrated grounding check into `addLearningItem`.
- **Confidence Rescoring**: Implemented dynamic project confidence calculation.
  - New formula: `(Interaction*0.3 + Verification*0.4 + Consistency*0.2 + Decay*0.1) * 100`
  - Added `recalculateProjectConfidence` in `src/lib/learning/manager.ts`.
  - Added `scripts/test-confidence.ts` for integration testing.
- **Chat Deletion**: Implemented individual conversation deletion.
  - Added UI swipe/click action in `Sidebar.tsx` with loading states and auto-navigation.
  - Implemented secure `DELETE /api/conversations/[id]` endpoint with cascading deletes.
- **Rich Content Display**: Enhanced message rendering capabilities.
  - Added `CodeBlock` component with syntax highlighting and Copy-to-Clipboard button.
  - Integrated `remark-gfm` support for rendering Markdown tables.
- **LLM Router Refinements**: Improved intent detection for creative tasks.
  - Added `image_generation` task type with strict regex detection (e.g., "create an image").
  - Implemented explicit routing to DALL-E (OpenAI) and Imagen (Google) for generation tasks.
  - Updated Agent Orchestrator to route visual tasks to Writer/Copywriter agents.
- **Chat Timestamps**: Added message timestamps to the UI.
  - Displays local time (e.g. "2:30 PM") for all messages.
  - Helps users track conversation history and latency.
- **File Upload Consent Gate**: Prevents knowledge pollution from uploaded files.
  - New `FileConsentDialog` component for choosing Ephemeral vs Persistent storage.
  - Ephemeral files are excluded from learning extraction to prevent cross-project contamination.
  - Persistent files stored in `project_documents` table with SHA-256 deduplication.
  - Added "Project Files" section to Sidebar with document listing and cascade delete.
  - New `/api/documents` endpoint for listing and archiving project documents.
  - Images/PDFs skip consent (no learning extraction from binary files).
- **Chat View Refinements**: Improved message rendering for less verbosity.
  - Card-based styling with visual section headers (h1/h2/h3 borders).
  - Response metadata bar ABOVE messages showing provider, token count, and timestamp.
  - New "Pin to Project" action for manual learning extraction from responses.
  - Compact paragraph and list styling to reduce wall-of-text effect.
  - Blockquotes styled as callout cards with blue accent.
  - New `/api/learnings` endpoint for creating, listing, and deleting learnings.
- **Collapsible Long Content**: Reduces cognitive load for lengthy LLM responses.
  - New `CollapsibleList` component auto-collapses lists with >3 items.
  - Shows first 3 items with "Show N more items" toggle.
  - `CollapsibleContent` and `CollapsibleSection` components for future use.

### Changed
- Provider presets now include `contextWindow` values for all models (`src/lib/providers/presets.ts`).
- Chat API route passes `contextWindow` from provider credentials to `injectLearningContext()` (`src/app/api/chat/route.ts`).
- Router resolves context window from provider credentials for tier selection (`src/lib/chorum/router.ts`).
- Renamed "None" to "No Agent" in the Agent Selector for clarity.
- Updated `LearningItemMetadata` interface in `src/lib/learning/types.ts` to support provenance tracking.
