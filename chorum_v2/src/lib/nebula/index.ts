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