// src/lib/core/podium/scorer.ts
// Relevance scoring — the mathematical core of Podium.
// Every weight and profile comes from PODIUM_INTERFACE_SPEC.md. Do not add new ones.

import type { LearningType } from '@/lib/nebula'
import type { ScoredLearning } from '@/lib/nebula'
import type { DomainSignal, QueryIntent } from '../interface'
import type { ScopeFilter } from '@/lib/nebula'

// ---------------------------------------------------------------------------
// Intent weight profiles
// These shift the scoring formula based on what the user is trying to do.
// ---------------------------------------------------------------------------

export interface WeightProfile {
    semantic: number
    recency: number
    confidence: number
    typeWeight: number
    scopeMatch: number
}

const INTENT_PROFILES: Record<QueryIntent, WeightProfile> = {
    question: { semantic: 0.40, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.10 },
    generation: { semantic: 0.40, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.10 },
    analysis: { semantic: 0.50, recency: 0.05, confidence: 0.20, typeWeight: 0.15, scopeMatch: 0.10 },
    debugging: { semantic: 0.30, recency: 0.35, confidence: 0.15, typeWeight: 0.10, scopeMatch: 0.10 },
    discussion: { semantic: 0.35, recency: 0.10, confidence: 0.25, typeWeight: 0.15, scopeMatch: 0.15 },
    continuation: { semantic: 0.30, recency: 0.40, confidence: 0.15, typeWeight: 0.05, scopeMatch: 0.10 },
    greeting: { semantic: 0.20, recency: 0.10, confidence: 0.30, typeWeight: 0.20, scopeMatch: 0.20 },
}

// ---------------------------------------------------------------------------
// Type weights by domain
// Types not listed for a domain default to 0.2 (low but non-zero).
// When domain is null: all types get 1.0 — no domain boost, no exclusion.
// ---------------------------------------------------------------------------

type DomainTypeWeights = Partial<Record<LearningType, number>>

const TYPE_WEIGHTS_BY_DOMAIN: Record<string, DomainTypeWeights> = {
    coding: {
        invariant: 1.0,
        anchor: 1.0,
        pattern: 0.9,
        decision: 0.8,
        golden_path: 0.7,
        antipattern: 0.6,
    },
    writing: {
        character: 1.0,
        world_rule: 1.0,
        anchor: 1.0,
        plot_thread: 0.9,
        voice: 0.8,
        setting: 0.7,
    },
    trading: {
        invariant: 1.0,
        anchor: 1.0,
        decision: 0.9,
        pattern: 0.8,
        antipattern: 0.7,
        golden_path: 0.6,
    },
    research: {
        decision: 1.0,
        invariant: 0.9,
        anchor: 1.0,
        pattern: 0.8,
        golden_path: 0.7,
    },
}

// Special boost multipliers for the debugging intent
const DEBUGGING_BOOSTS: Partial<Record<LearningType, number>> = {
    antipattern: 2.0,
    decision: 0.5,
}

export function getTypeWeight(
    type: LearningType,
    domain: DomainSignal['primary'],
    intent: QueryIntent,
): number {
    // When domain is null: all types score equally (no domain bias)
    if (domain === null) {
        const base = 1.0
        const boost = DEBUGGING_BOOSTS[type]
        return intent === 'debugging' && boost !== undefined ? base * boost : base
    }

    // When domain is known: look up domain-specific weight; default to 0.2
    const domainWeights = TYPE_WEIGHTS_BY_DOMAIN[domain] ?? {}
    const base = domainWeights[type] ?? 0.2

    // Apply debugging boost on top of domain weight
    const boost = DEBUGGING_BOOSTS[type]
    return intent === 'debugging' && boost !== undefined ? base * boost : base
}

// ---------------------------------------------------------------------------
// Recency scoring
// ---------------------------------------------------------------------------

export function computeRecencyScore(lastUsedAt: Date | null, createdAt: Date): number {
    const reference = lastUsedAt ?? createdAt
    const ageDays = (Date.now() - reference.getTime()) / 86_400_000
    return Math.pow(0.5, ageDays / 30)   // halves every 30 days; 1.0 if used today
}

// ---------------------------------------------------------------------------
// Scope match scoring
// ---------------------------------------------------------------------------

export function computeScopeMatchScore(
    itemScopes: string[],
    scopeFilter: ScopeFilter,
): number {
    const hasInclude = scopeFilter.include.length === 0
        || scopeFilter.include.some((s) => itemScopes.includes(s))
    const hasBoost = scopeFilter.boost.length > 0
        && scopeFilter.boost.some((s) => itemScopes.includes(s))

    return Math.min(1.0, (hasInclude ? 0.6 : 0) + (hasBoost ? 0.4 : 0))
}

// ---------------------------------------------------------------------------
// Primary scoring function
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
    learning: ScoredLearning
    score: number
    attentionDensity: number   // score / tokenCount — the selection metric
    tokenCount: number
    includeReason: string
    excludeReason: string | null
}

export function scoreCandidate(
    learning: ScoredLearning,
    intent: QueryIntent,
    domain: DomainSignal['primary'],
    scopeFilter: ScopeFilter,
    itemScopes: string[],
): Omit<ScoredCandidate, 'tokenCount' | 'attentionDensity' | 'excludeReason'> {
    const profile = INTENT_PROFILES[intent]

    const semantic = learning.semanticScore          // 0–1, from Nebula searchByEmbedding
    const confidence = learning.confidence              // 0–1, the EFFECTIVE value (after decay)
    const recency = computeRecencyScore(learning.lastUsedAt, learning.createdAt)
    const typeW = getTypeWeight(learning.type as LearningType, domain, intent)
    const scopeMatch = computeScopeMatchScore(itemScopes, scopeFilter)

    const score =
        semantic * profile.semantic +
        confidence * profile.confidence +
        typeW * profile.typeWeight +
        recency * profile.recency +
        scopeMatch * profile.scopeMatch

    return {
        learning,
        score,
        includeReason: `score=${score.toFixed(3)} [sem=${semantic.toFixed(2)} conf=${confidence.toFixed(2)} type=${typeW.toFixed(2)} rec=${recency.toFixed(2)} scope=${scopeMatch.toFixed(2)}]`,
    }
}
