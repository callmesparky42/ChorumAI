/**
 * Relevance Engine
 * Scores memory items and selects the best ones to fit the token budget.
 */

import { QueryClassification } from './classifier'

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

            // 2. Recency Score (Decay over 30 days)
            const daysSince = item.createdAt
                ? (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                : 365
            const recencyScore = Math.exp(-daysSince / 30) // e^(-t/30)

            // 3. Domain Score
            let domainScore = 0
            if (item.domains && classification.domains.length > 0) {
                const overlap = item.domains.filter(d => classification.domains.includes(d))
                if (overlap.length > 0) domainScore = 0.2
            }

            // 4. Usage Score
            const usageScore = Math.min((item.usageCount || 0) / 10, 0.15)

            // 5. Type Boost
            let typeBoost = 0
            switch (item.type) {
                case 'invariant': typeBoost = 0.25; break; // Invariants are critical
                case 'pattern': typeBoost = 0.1; break;
                case 'decision': typeBoost = 0.1; break;
                case 'golden_path': typeBoost = 0.15; break; // Golden paths are solutions
            }

            // Weighted Combination
            // Semantic is king (50%), identifying valid context
            // Invariants get huge boost to always surface if marginally relevant
            const totalScore = (
                semanticScore * 0.5 +
                recencyScore * 0.15 +
                domainScore * 0.15 +
                usageScore +
                typeBoost
            )

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
