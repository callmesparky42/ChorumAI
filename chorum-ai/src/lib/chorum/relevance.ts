/**
 * Relevance Engine
 * Scores memory items and selects the best ones to fit the token budget.
 */

import { QueryClassification } from './classifier'
import type { LearningType } from '../learning/types'

// Interface matching the DB schema shape (plus embedding)
export interface MemoryCandidate {
    id: string
    type: string // pattern, invariant, decision, etc
    content: string
    context: string | null
    embedding: number[] | null
    domains: string[] | null
    usageCount: number
    lastUsedAt: Date | null
    createdAt: Date | null
    // Calculated fields
    score?: number
    retrievalReason?: string
    linkType?: string
}

// ============================================================================
// Per-Type Decay Curves
// Cognitive rationale: different knowledge types age at different rates.
// Half-life = days until recency drops to 0.50
// ============================================================================

export interface DecayConfig {
    halfLifeDays: number | null  // null = no decay (always 1.0)
    floor: number                // Minimum recency score (never drops below this)
    rationale: string            // For documentation/logging
}

export const DECAY_CURVES: Record<LearningType, DecayConfig> = {
    invariant: {
        halfLifeDays: null,
        floor: 1.0,
        rationale: 'Constraints never expire — "never use console.log" is perpetual'
    },
    decision: {
        halfLifeDays: 365,
        floor: 0.3,
        rationale: 'Architecture ages very slowly — decisions compound over project lifetime'
    },
    pattern: {
        halfLifeDays: 90,
        floor: 0.15,
        rationale: 'Conventions stabilize quickly and stay relevant for months'
    },
    golden_path: {
        halfLifeDays: 30,
        floor: 0.05,
        rationale: 'Procedures get stale as tooling and processes evolve'
    },
    antipattern: {
        halfLifeDays: 14,
        floor: 0.02,
        rationale: '"Don\'t do X" loses relevance as the developer learns to avoid it'
    }
}

const LN2 = Math.LN2 // 0.6931...

/**
 * Calculate recency score using type-specific decay curve.
 *
 * @param daysSince - Days since the learning was created
 * @param type - Learning type (determines decay rate)
 * @returns Recency score between floor and 1.0
 */
export function calculateDecay(daysSince: number, type: string): number {
    const config = DECAY_CURVES[type as LearningType]
    if (!config) {
        // Unknown type: fall back to moderate 30-day decay
        return Math.max(0.05, Math.exp(-daysSince * LN2 / 30))
    }

    // No decay: always 1.0 (invariants)
    if (config.halfLifeDays === null) {
        return config.floor // floor is 1.0 for invariants
    }

    // Exponential decay with half-life and floor
    const raw = Math.exp(-daysSince * LN2 / config.halfLifeDays)
    return Math.max(config.floor, raw)
}

// ============================================================================
// Dynamic Weight Profiles
// Weights shift based on what the user is trying to accomplish.
// All weights for a profile should sum to ~1.0 (excluding type boost).
// ============================================================================

export interface WeightProfile {
    semantic: number    // Cosine similarity weight
    recency: number     // Decay-adjusted recency weight
    domain: number      // Domain overlap weight
    usage: number       // Usage frequency weight
    typeBoostMultiplier: Record<string, number>  // Per-type boost multipliers
}

const WEIGHT_PROFILES: Record<string, WeightProfile> = {
    question: {
        semantic: 0.55,
        recency: 0.10,
        domain: 0.20,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 1.0,
            golden_path: 1.0,
            antipattern: 1.0
        }
    },
    generation: {
        semantic: 0.45,
        recency: 0.10,
        domain: 0.25,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 2.0,      // Patterns are critical when generating code
            decision: 1.0,
            golden_path: 1.5,  // Recipes help with generation
            antipattern: 1.0
        }
    },
    analysis: {
        semantic: 0.50,
        recency: 0.05,
        domain: 0.20,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 2.0,     // Decisions are critical when analyzing
            golden_path: 0.5,
            antipattern: 1.0
        }
    },
    discussion: {
        // Same as question — general conversational context
        semantic: 0.55,
        recency: 0.10,
        domain: 0.20,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 1.0,
            golden_path: 1.0,
            antipattern: 1.0
        }
    },
    continuation: {
        semantic: 0.40,
        recency: 0.30,         // Recent context matters most in continuations
        domain: 0.10,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 1.0,
            golden_path: 1.0,
            antipattern: 1.0
        }
    },
    greeting: {
        // Greetings get trivial budget anyway, but define for completeness
        semantic: 0.50,
        recency: 0.15,
        domain: 0.15,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 1.0,
            golden_path: 1.0,
            antipattern: 1.0
        }
    }
}

/**
 * Get the weight profile for a given query intent.
 * Falls back to 'question' profile if intent is unknown.
 */
function getWeightProfile(intent: string): WeightProfile {
    return WEIGHT_PROFILES[intent] || WEIGHT_PROFILES.question
}

// ============================================================================
// Usage Scoring
// ============================================================================

/**
 * Usage score: logarithmic curve that rewards initial usage but plateaus.
 * Items with very high usage (>20) get a slight PENALTY as a signal
 * that they should be promoted to compiled tiers, not re-retrieved.
 */
export function calculateUsageScore(usageCount: number): number {
    if (usageCount <= 0) return 0

    // Log curve: rises quickly for first few uses, then flattens
    // ln(1) = 0, ln(5) ≈ 1.6, ln(10) ≈ 2.3, ln(20) ≈ 3.0
    const logScore = Math.log(usageCount + 1) / Math.log(21) // Normalized to ~1.0 at 20 uses

    // Cap at 0.15 (same ceiling as before)
    return Math.min(logScore * 0.15, 0.15)
}

export class RelevanceEngine {

    /**
     * Scores a list of memory candidates against the query embedding and classification.
     */
    public scoreCandidates(
        candidates: MemoryCandidate[],
        queryEmbedding: number[],
        classification: QueryClassification
    ): MemoryCandidate[] {
        return candidates.map(item => {
            // 1. Semantic Score (Cosine Similarity)
            let semanticScore = 0
            if (item.embedding && queryEmbedding.length > 0) {
                semanticScore = this.cosineSimilarity(item.embedding, queryEmbedding)
            }

            // 2. Recency Score (Per-Type Decay)
            const daysSince = item.createdAt
                ? (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                : 365
            const recencyScore = calculateDecay(daysSince, item.type)

            // 3. Domain Score
            let domainScore = 0
            if (item.domains && classification.domains.length > 0) {
                const overlap = item.domains.filter(d => classification.domains.includes(d))
                if (overlap.length > 0) domainScore = 0.2
            }

            // 4. Usage Score
            const usageScore = calculateUsageScore(item.usageCount || 0)

            // 5. Type Boost — modulated by intent
            const profile = getWeightProfile(classification.intent)

            let typeBoost = 0
            switch (item.type) {
                case 'invariant': typeBoost = 0.25; break; // Invariants are critical
                case 'pattern': typeBoost = 0.1; break;
                case 'decision': typeBoost = 0.1; break;
                case 'golden_path': typeBoost = 0.15; break; // Golden paths are solutions
                case 'antipattern': typeBoost = 0.05; break;
            }

            // Apply intent-specific multiplier to type boost
            const typeMultiplier = profile.typeBoostMultiplier[item.type] ?? 1.0
            typeBoost *= typeMultiplier

            // 6. Weighted Combination
            const totalScore = (
                semanticScore * profile.semantic +
                recencyScore * profile.recency +
                domainScore * profile.domain +
                usageScore * profile.usage +
                typeBoost
            )

            // Debug logging
            if (process.env.CHORUM_DEBUG_DECAY === 'true') {
                console.log(
                    `[Chorum:Decay] ${item.type.padEnd(12)} | ` +
                    `Age: ${Math.floor(daysSince).toString().padStart(4)}d | ` +
                    `Recency: ${recencyScore.toFixed(3)} | ` +
                    `Half-life: ${DECAY_CURVES[item.type as LearningType]?.halfLifeDays ?? '30(fallback)'}d`
                )
            }

            if (process.env.CHORUM_DEBUG_SCORING === 'true') {
                console.log(
                    `[Chorum:Score] ${item.type.padEnd(12)} | ` +
                    `Total: ${totalScore.toFixed(3)} | ` +
                    `Sem: ${(semanticScore * profile.semantic).toFixed(3)} | ` +
                    `Rec: ${(recencyScore * profile.recency).toFixed(3)} | ` +
                    `Dom: ${(domainScore * profile.domain).toFixed(3)} | ` +
                    `Use: ${(usageScore * profile.usage).toFixed(3)} | ` +
                    `Typ: ${typeBoost.toFixed(3)} | ` +
                    `Intent: ${classification.intent}`
                )
            }

            return { ...item, score: totalScore }
        })
    }

    /**
     * Greedily selects items until budget is full.
     */
    public selectMemory(candidates: MemoryCandidate[], maxTokens: number): MemoryCandidate[] {
        // Sort by score descending (copy array to avoid mutation)
        const sorted = [...candidates].sort((a, b) => (b.score || 0) - (a.score || 0))

        const selected: MemoryCandidate[] = []
        let currentTokens = 0

        for (const item of sorted) {
            const score = item.score || 0

            // Hard Threshold: Ignore noise
            // Lower threshold for invariants (we want to catch them even if semantic match is weak)
            const threshold = item.type === 'invariant' ? 0.2 : 0.35
            if (score < threshold) continue

            // Estimate tokens (approx 4 chars per token)
            // Include context in cost
            const contentLen = item.content.length + (item.context?.length || 0)
            const cost = Math.ceil(contentLen / 4) + 10 // +10 overhead

            if (currentTokens + cost <= maxTokens) {
                selected.push(item)
                currentTokens += cost
            }
        }

        return selected
    }

    /**
     * Formats selected items into the injection string.
     */
    public assembleContext(items: MemoryCandidate[]): string {
        if (items.length === 0) return ''

        const groups: Record<string, MemoryCandidate[]> = {}
        for (const item of items) {
            if (!groups[item.type]) groups[item.type] = []
            groups[item.type].push(item)
        }

        const sections: string[] = ['<chorum_context>']

        if (groups['invariant']) {
            sections.push('## Active Invariants')
            groups['invariant'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['pattern']) {
            sections.push('## Relevant Patterns')
            groups['pattern'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['decision']) {
            sections.push('## Project Decisions')
            groups['decision'].forEach(i => sections.push(`- ${i.content} (Context: ${i.context || 'None'})`))
        }

        if (groups['golden_path']) {
            sections.push('## Golden Paths')
            groups['golden_path'].forEach(i => sections.push(`- ${i.content}`))
        }

        // Catch-all
        const otherTypes = Object.keys(groups).filter(t => !['invariant', 'pattern', 'decision', 'golden_path'].includes(t))
        if (otherTypes.length > 0) {
            sections.push('## Other Context')
            otherTypes.forEach(t => {
                groups[t].forEach(i => sections.push(`- [${t}] ${i.content}`))
            })
        }

        sections.push('</chorum_context>')
        return sections.join('\n')
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0
        let dot = 0
        let magA = 0
        let magB = 0
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i]
            magA += a[i] * a[i]
            magB += b[i] * b[i]
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1)
    }
}

export const relevance = new RelevanceEngine()
