# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Memory Safety Layer**: Implemented "Deterministic Grounding" to prevent poison-pill memory injection.
  - Added `verifyReference` in `src/lib/learning/grounding.ts`.
  - Added `provenance` field to learning items for Source Tagging (conversation & message tracking).
  - Integrated grounding check into `addLearningItem`.
- **Confidence Rescoring**: Implemented dynamic project confidence calculation.
  - New formula: `(Interaction*0.3 + Verification*0.4 + Consistency*0.2 + Decay*0.1) * 100`
  - Added `recalculateProjectConfidence` in `src/lib/learning/manager.ts`.
  - Added `scripts/test-confidence.ts` for integration testing.

### Changed
- Updated `LearningItemMetadata` interface in `src/lib/learning/types.ts` to support provenance tracking.
