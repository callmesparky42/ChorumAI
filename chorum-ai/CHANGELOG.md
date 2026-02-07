# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
