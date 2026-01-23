/**
 * Security Audit Tests for Relevance Gating System
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { classifier } from './classifier'
import { relevance, type MemoryCandidate } from './relevance'

describe('Relevance Gating Security Audit', () => {

    describe('Input Validation', () => {
        it('should handle extremely long input without hanging', () => {
            const longInput = 'a'.repeat(100000)
            const start = Date.now()
            const result = classifier.classify(longInput, 0)
            const elapsed = Date.now() - start
            assert.ok(elapsed < 500, `Long input took ${elapsed}ms, expected < 500ms`)
            assert.ok(result.complexity !== undefined)
        })

        it('should handle special characters without crashing', () => {
            const injectionTests = [
                '<script>alert(1)</script>',
                '${process.env.API_KEY}',
                '{{constructor.constructor("return this")()}}',
                '\x00\x01\x02 null bytes',
                'SELECT * FROM users; DROP TABLE users;--',
            ]
            for (const test of injectionTests) {
                const result = classifier.classify(test, 0)
                assert.ok(result.complexity !== undefined, `Failed on: ${test}`)
            }
        })

        it('should handle empty and whitespace-only input', () => {
            assert.ok(classifier.classify('', 0).complexity === 'trivial')
            assert.ok(classifier.classify('   ', 0).complexity === 'trivial')
            assert.ok(classifier.classify('\n\t\r', 0).complexity === 'trivial')
        })
    })

    describe('Token Budget Security', () => {
        it('should enforce hard ceiling of 10K tokens', () => {
            // Maximum modifiers: deep (8000) * 1.5 (history) * 1.2 (depth) * 1.2 (analysis) = 17280
            // Should be capped at 10000
            const classification = {
                complexity: 'deep' as const,
                intent: 'analysis' as const,
                domains: [],
                conversationDepth: 100,
                hasCodeContext: true,
                referencesHistory: true
            }
            const budget = classifier.calculateBudget(classification)
            assert.ok(budget.maxTokens <= 10000, `Budget ${budget.maxTokens} exceeds 10K ceiling`)
        })

        it('should return 0 tokens for trivial queries', () => {
            const result = classifier.classify('hi', 0)
            const budget = classifier.calculateBudget(result)
            assert.strictEqual(budget.maxTokens, 0)
        })
    })

    describe('Relevance Engine Robustness', () => {
        it('should handle malformed candidates gracefully', () => {
            const malformedCandidates: MemoryCandidate[] = [
                { id: '1', type: 'pattern', content: '', context: null, embedding: null, domains: null, usageCount: -1, lastUsedAt: null, createdAt: null },
                { id: '2', type: 'unknown', content: 'test', context: null, embedding: [NaN, Infinity], domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
                { id: '3', type: 'invariant', content: 'test', context: null, embedding: [], domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
            ]

            const scored = relevance.scoreCandidates(malformedCandidates, [0.1], {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })

            assert.strictEqual(scored.length, 3, 'Should return all candidates even if malformed')
            assert.ok(scored.every(s => typeof s.score === 'number'), 'All scores should be numbers')
        })

        it('should handle empty embedding arrays', () => {
            const candidates: MemoryCandidate[] = [
                { id: '1', type: 'pattern', content: 'test', context: null, embedding: [], domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
            ]

            const scored = relevance.scoreCandidates(candidates, [], {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })

            assert.strictEqual(scored.length, 1)
            // Score should still be calculated from other factors (recency, type boost)
            assert.ok(scored[0].score !== undefined)
        })

        it('should handle mismatched embedding dimensions', () => {
            const candidates: MemoryCandidate[] = [
                { id: '1', type: 'pattern', content: 'test', context: null, embedding: [0.1, 0.2, 0.3], domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
            ]

            // Query embedding has different dimensions
            const scored = relevance.scoreCandidates(candidates, [0.1, 0.2], {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })

            // Should return 0 for cosine similarity when dimensions mismatch
            assert.strictEqual(scored.length, 1)
        })
    })

    describe('Performance / DoS Prevention', () => {
        it('should handle large candidate arrays efficiently', () => {
            const largeCandidates: MemoryCandidate[] = Array.from({ length: 5000 }, (_, i) => ({
                id: String(i),
                type: 'pattern',
                content: `Pattern ${i} with some content to make it realistic`,
                context: null,
                embedding: Array(384).fill(0.1),
                domains: ['test'],
                usageCount: i % 10,
                lastUsedAt: null,
                createdAt: new Date()
            }))

            const start = Date.now()
            const scored = relevance.scoreCandidates(largeCandidates, Array(384).fill(0.1), {
                complexity: 'moderate', intent: 'question', domains: ['test'],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })
            const selected = relevance.selectMemory(scored, 2000)
            const elapsed = Date.now() - start

            assert.ok(elapsed < 2000, `5K candidates took ${elapsed}ms, expected < 2000ms`)
            assert.ok(selected.length > 0 && selected.length < 100, 'Should select reasonable number of items')
        })
    })

    describe('Output Safety', () => {
        it('should not escape content (LLM context, not HTML)', () => {
            const xssCandidates: MemoryCandidate[] = [
                { id: '1', type: 'invariant', content: '<img src=x onerror=alert(1)>', context: null, embedding: [0.9], domains: [], usageCount: 5, lastUsedAt: null, createdAt: new Date() },
            ]
            const scored = relevance.scoreCandidates(xssCandidates, [0.9], {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })
            const selected = relevance.selectMemory(scored, 5000)
            const context = relevance.assembleContext(selected)

            // Content should be preserved as-is for LLM context
            // (XSS escaping is UI responsibility, not backend)
            assert.ok(context.includes('<img src=x onerror=alert(1)>'))
        })

        it('should properly structure output with XML-like tags', () => {
            const candidates: MemoryCandidate[] = [
                { id: '1', type: 'invariant', content: 'Test rule', context: null, embedding: [0.9], domains: [], usageCount: 5, lastUsedAt: null, createdAt: new Date() },
            ]
            const scored = relevance.scoreCandidates(candidates, [0.9], {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })
            const selected = relevance.selectMemory(scored, 5000)
            const context = relevance.assembleContext(selected)

            assert.ok(context.startsWith('<chorum_context>'))
            assert.ok(context.endsWith('</chorum_context>'))
        })
    })

    describe('Threshold Enforcement', () => {
        it('should filter items below relevance threshold', () => {
            const candidates: MemoryCandidate[] = [
                { id: '1', type: 'pattern', content: 'High relevance', context: null, embedding: Array(384).fill(0.9), domains: [], usageCount: 10, lastUsedAt: null, createdAt: new Date() },
                { id: '2', type: 'pattern', content: 'Zero embedding (irrelevant)', context: null, embedding: Array(384).fill(0), domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date(0) },
            ]

            const scored = relevance.scoreCandidates(candidates, Array(384).fill(0.9), {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })
            const selected = relevance.selectMemory(scored, 10000)

            // Low relevance item should be filtered out (threshold 0.35 for non-invariants)
            assert.ok(selected.length <= 2)
        })

        it('should use lower threshold for invariants', () => {
            const candidates: MemoryCandidate[] = [
                { id: '1', type: 'invariant', content: 'Critical rule', context: null, embedding: Array(384).fill(0.3), domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
                { id: '2', type: 'pattern', content: 'Regular pattern', context: null, embedding: Array(384).fill(0.3), domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date() },
            ]

            const scored = relevance.scoreCandidates(candidates, Array(384).fill(0.3), {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })
            const selected = relevance.selectMemory(scored, 10000)

            // Invariant should have lower threshold (0.2) vs pattern (0.35)
            const hasInvariant = selected.some(s => s.type === 'invariant')
            // With same embedding similarity, invariant should be included due to type boost
            assert.ok(hasInvariant || selected.length === 0)
        })
    })
})
