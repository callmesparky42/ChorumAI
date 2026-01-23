import { describe, it } from 'node:test'
import assert from 'node:assert'
import { classifier } from './classifier'
import { relevance, type MemoryCandidate } from './relevance'

// Mock embeddings for test speed
const mockVector = new Array(384).fill(0.1)

describe('Relevance Gating System', () => {

    describe('Classifier', () => {
        it('should classify "hi" as trivial', () => {
            const result = classifier.classify('hi', 0)
            assert.strictEqual(result.complexity, 'trivial')
        })

        it('should classify "how do I implement auth?" as simple/moderate', () => {
            const result = classifier.classify('how do I implement auth?', 0)
            // Expect simple or moderate depending on length logic
            assert.ok(['simple', 'moderate'].includes(result.complexity))
            assert.ok(result.domains.includes('security')) // 'auth' -> 'security'
        })

        it('should detect code context', () => {
            const result = classifier.classify('const x = 5', 0)
            assert.strictEqual(result.hasCodeContext, true)
        })
    })

    describe('Relevance Engine', () => {
        it('should score exact matches highly', () => {
            const candidate: MemoryCandidate = {
                id: '1', type: 'pattern', content: 'test', context: null,
                embedding: mockVector, domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date()
            }
            const queryVector = mockVector

            // Assume 1.0 cosine similarity
            const result = relevance.scoreCandidates([candidate], queryVector, {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })

            // Base .5 for semantic + type/recency stuff
            assert.ok(result[0].score! > 0.5)
        })

        it('should prioritize invariants', () => {
            const candidateI: MemoryCandidate = {
                id: '1', type: 'invariant', content: 'Always fail safe', context: null,
                embedding: mockVector, domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date()
            }
            const candidateP: MemoryCandidate = {
                id: '2', type: 'pattern', content: 'Try catch block', context: null,
                embedding: mockVector, domains: [], usageCount: 0, lastUsedAt: null, createdAt: new Date()
            }

            const result = relevance.scoreCandidates([candidateI, candidateP], mockVector, {
                complexity: 'simple', intent: 'question', domains: [],
                conversationDepth: 0, hasCodeContext: false, referencesHistory: false
            })

            // Invariant boost (.25) vs Pattern boost (.1)
            assert.ok(result[0].score! > result[1].score!)
            assert.strictEqual(result[0].type, 'invariant')
        })
    })
})
