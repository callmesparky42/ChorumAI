/**
 * Relevance Engine
 * Scores memory items and selects the best ones to fit the token budget.
 */

import { QueryClassification, QueryIntent } from './classifier'
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
    // Conductor's Podium
    pinnedAt?: Date | null  // User pinned - always include in context
    mutedAt?: Date | null   // User muted - never include in context
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
    anchor: {
        halfLifeDays: null,
        floor: 1.0,
        rationale: 'Identity anchors are perpetual — project names never change'
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
    },
    // Writing-domain decay curves
    character: {
        halfLifeDays: null,
        floor: 1.0,
        rationale: 'Characters are perpetual — Marcus is always Marcus'
    },
    world_rule: {
        halfLifeDays: null,
        floor: 1.0,
        rationale: 'World rules are invariants of the story — they never expire'
    },
    setting: {
        halfLifeDays: 365,
        floor: 0.3,
        rationale: 'Settings rarely change — 1987 Portland stays 1987 Portland'
    },
    plot_thread: {
        halfLifeDays: 90,
        floor: 0.15,
        rationale: 'Plot threads stay relevant across chapters until resolved'
    },
    voice: {
        halfLifeDays: 365,
        floor: 0.3,
        rationale: 'Voice/style decisions are architectural — they last the whole project'
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
    debugging: {
        semantic: 0.30,         // Lower — when debugging, you often don't know the right search terms
        recency: 0.35,          // Highest of any intent — recent context is critical when debugging
        domain: 0.15,
        usage: 0.05,
        typeBoostMultiplier: {
            invariant: 1.0,
            pattern: 1.0,
            decision: 0.5,      // Architectural decisions less relevant when fixing a bug
            golden_path: 1.5,   // Step-by-step recipes can help fix recurring issues
            antipattern: 2.0    // "Don't do X" is critical when you might be doing X
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
 * Get a dynamically shifted weight profile based on intent + classification signals.
 *
 * Shifts applied:
 * - Deep conversations (depth > 10): recency +0.10, semantic -0.10
 *     Rationale: recent context matters more as conversation evolves
 * - Code-heavy queries: domain +0.08, usage +0.02, semantic -0.10
 *     Rationale: domain matching is critical when code is present
 * - History-referencing queries: semantic +0.10, recency -0.05, domain -0.05
 *     Rationale: "remember when we..." needs strong semantic matching
 *
 * Shifts are additive and clamped to [0, 1]. Sum is re-normalized.
 */
function getWeightProfile(intent: string, classification?: QueryClassification): WeightProfile {
    const base = WEIGHT_PROFILES[intent] || WEIGHT_PROFILES.question

    // No classification? Return static profile.
    if (!classification) return base

    // Start with a mutable copy of the base weights
    let semantic = base.semantic
    let recency = base.recency
    let domain = base.domain
    let usage = base.usage

    // Shift 1: Deep conversations → boost recency
    if (classification.conversationDepth > 10) {
        recency += 0.10
        semantic -= 0.10
    }

    // Shift 2: Code context → boost domain
    if (classification.hasCodeContext) {
        domain += 0.08
        usage += 0.02
        semantic -= 0.10
    }

    // Shift 3: History references → boost semantic
    if (classification.referencesHistory) {
        semantic += 0.10
        recency -= 0.05
        domain -= 0.05
    }

    // Clamp all weights to [0, 1]
    semantic = Math.max(0, Math.min(1, semantic))
    recency = Math.max(0, Math.min(1, recency))
    domain = Math.max(0, Math.min(1, domain))
    usage = Math.max(0, Math.min(1, usage))

    // Re-normalize so weights sum to ~1.0 (excluding type boost)
    const sum = semantic + recency + domain + usage
    if (sum > 0) {
        semantic /= sum
        recency /= sum
        domain /= sum
        usage /= sum
    }

    return {
        semantic,
        recency,
        domain,
        usage,
        typeBoostMultiplier: base.typeBoostMultiplier
    }
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

// ============================================================================
// Intent-Adaptive Score Thresholds
// Debugging casts a wider net (lower threshold); generation demands precision.
// ============================================================================

const INTENT_THRESHOLDS: Record<QueryIntent, { general: number; invariant: number }> = {
    debugging: { general: 0.25, invariant: 0.15 },  // Wide net — surface antipatterns & golden paths
    question: { general: 0.35, invariant: 0.20 },
    analysis: { general: 0.35, invariant: 0.20 },
    generation: { general: 0.40, invariant: 0.20 },  // Precision — only inject highly relevant
    discussion: { general: 0.35, invariant: 0.20 },
    continuation: { general: 0.30, invariant: 0.18 },
    greeting: { general: 0.50, invariant: 0.30 },  // High bar — greetings rarely need context
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
            if (item.domains && item.domains.length > 0 && classification.domains.length > 0) {
                const overlap = item.domains.filter(d => classification.domains.includes(d))
                if (overlap.length > 0) {
                    // Proportional: reward items that match on more domains
                    // Jaccard-inspired: overlap / max(either set) — biased toward precision
                    domainScore = 0.2 * (overlap.length / Math.max(item.domains.length, classification.domains.length))
                }
            }

            // 4. Usage Score
            const usageScore = calculateUsageScore(item.usageCount || 0)

            // 5. Type Boost — modulated by intent (with dynamic weight shifting)
            const profile = getWeightProfile(classification.intent, classification)

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
     * 
     * Conductor's Podium enhancements:
     * - Muted items are always excluded
     * - Pinned items are always included first (counted against budget)
     * - conductorLens multiplies the token budget (0.25-2.0)
     * - focusDomains boost matching items by +0.15
     */
    public selectMemory(
        candidates: MemoryCandidate[],
        maxTokens: number,
        intent?: QueryIntent,
        options?: {
            conductorLens?: number     // Budget multiplier (0.25-2.0)
            focusDomains?: string[]    // Domains to boost
        }
    ): MemoryCandidate[] {
        // Apply conductor lens to budget (clamp 0.25-2.0)
        const lens = Math.max(0.25, Math.min(2.0, options?.conductorLens ?? 1.0))
        const effectiveBudget = Math.floor(maxTokens * lens)

        // Debug logging
        if (process.env.CHORUM_DEBUG_CONDUCTOR === 'true') {
            console.log(`[Conductor] Lens: ${lens}x | Budget: ${maxTokens} → ${effectiveBudget}`)
        }

        // Step 1: Filter out muted items
        const nonMuted = candidates.filter(item => !item.mutedAt)

        // Step 2: Separate pinned items (always include first)
        const pinned = nonMuted.filter(item => item.pinnedAt)
        const unpinned = nonMuted.filter(item => !item.pinnedAt)

        // Step 3: Apply focus domain boost to unpinned items
        const focusDomains = options?.focusDomains || []
        const boostedUnpinned = unpinned.map(item => {
            if (focusDomains.length > 0 && item.domains?.length) {
                const hasMatchingDomain = item.domains.some(d => focusDomains.includes(d))
                if (hasMatchingDomain) {
                    return { ...item, score: (item.score || 0) + 0.15 }
                }
            }
            return item
        })

        // Step 4: Sort by score descending
        const sortedUnpinned = [...boostedUnpinned].sort((a, b) => (b.score || 0) - (a.score || 0))

        // Step 5: Build selection starting with pinned items
        const selected: MemoryCandidate[] = []
        let currentTokens = 0

        // Helper to calculate token cost
        const calcCost = (item: MemoryCandidate) => {
            const contentLen = item.content.length + (item.context?.length || 0)
            return Math.ceil(contentLen / 4) + 10 // +10 overhead
        }

        // Include all pinned items first (even if over budget—they're user-mandated)
        for (const item of pinned) {
            const cost = calcCost(item)
            selected.push({ ...item, retrievalReason: 'pinned' })
            currentTokens += cost

            if (process.env.CHORUM_DEBUG_CONDUCTOR === 'true') {
                console.log(`[Conductor] 📌 Pinned: "${item.content.slice(0, 50)}..." (${cost} tokens)`)
            }
        }

        // Use intent-adaptive thresholds (fall back to 'question' defaults)
        const thresholds = INTENT_THRESHOLDS[intent || 'question'] || INTENT_THRESHOLDS.question

        // Fill remaining budget with scored items
        for (const item of sortedUnpinned) {
            const score = item.score || 0

            // Confidence gate: skip items below intent-specific threshold
            const threshold = item.type === 'invariant' ? thresholds.invariant : thresholds.general
            if (score < threshold) continue

            const cost = calcCost(item)

            if (currentTokens + cost <= effectiveBudget) {
                selected.push(item)
                currentTokens += cost
            }
        }

        if (process.env.CHORUM_DEBUG_CONDUCTOR === 'true') {
            console.log(`[Conductor] Selected: ${selected.length} items (${currentTokens}/${effectiveBudget} tokens)`)
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

        // Universal sections
        if (groups['anchor']) {
            sections.push('## Project Identity & Anchors')
            groups['anchor'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['invariant']) {
            sections.push('## Active Invariants')
            groups['invariant'].forEach(i => sections.push(`- ${i.content}`))
        }

        // Code-domain sections
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

        // Writing-domain sections
        if (groups['character']) {
            sections.push('## Characters')
            groups['character'].forEach(i => sections.push(`- ${i.content}${i.context ? ` (${i.context})` : ''}`))
        }

        if (groups['setting']) {
            sections.push('## Setting & Atmosphere')
            groups['setting'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['plot_thread']) {
            sections.push('## Active Plot Threads')
            groups['plot_thread'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['voice']) {
            sections.push('## Voice & Style')
            groups['voice'].forEach(i => sections.push(`- ${i.content}`))
        }

        if (groups['world_rule']) {
            sections.push('## World Rules')
            groups['world_rule'].forEach(i => sections.push(`- ${i.content}`))
        }

        // Catch-all for any unknown types
        const knownTypes = [
            'invariant', 'pattern', 'decision', 'golden_path', 'anchor', 'antipattern',
            'character', 'setting', 'plot_thread', 'voice', 'world_rule'
        ]
        const otherTypes = Object.keys(groups).filter(t => !knownTypes.includes(t))
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
