# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-03

### Added
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
- Renamed "None" to "No Agent" in the Agent Selector for clarity.
- Updated `LearningItemMetadata` interface in `src/lib/learning/types.ts` to support provenance tracking.
