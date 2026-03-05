// Layer 1 — Binary Star Core (Podium + Conductor)
// src/lib/core/index.ts
// Layer 1 — Binary Star Core public surface
// Layer 2 imports BinaryStarInterface and createBinaryStar only.

export type {
    BinaryStarInterface, PodiumRequest, PodiumResult, InjectedLearning,
    ConductorSignal, ConductorProposal, DomainSignal, QueryIntent,
    QueryComplexity, ProposalType, ConductorSignalType
} from './interface'
export { createBinaryStar } from './impl'
export { HALF_LIFE_DAYS, CONFIDENCE_FLOOR } from './conductor/decay'
