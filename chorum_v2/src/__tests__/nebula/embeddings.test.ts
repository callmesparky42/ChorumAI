// src/__tests__/nebula/embeddings.test.ts
// Unit tests for Nebula embeddings — cross-lens guard and dim routing
import { vi, describe, it, expect, beforeEach } from 'vitest'

const {
    mockExecute, mockInsert, mockValues, mockOnConflict,
    mockSelect, mockFrom, mockWhere, mockLimit,
} = vi.hoisted(() => {
    const mockExecute = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockOnConflict = vi.fn()
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()

    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict })
    mockOnConflict.mockResolvedValue(undefined)
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockWhere.mockReturnValue({ limit: mockLimit })
    mockLimit.mockResolvedValue([])

    return {
        mockExecute, mockInsert, mockValues, mockOnConflict,
        mockSelect, mockFrom, mockWhere, mockLimit,
    }
})

vi.mock('@/db', () => ({
    db: {
        execute: mockExecute,
        insert: mockInsert,
        select: mockSelect,
    },
}))

vi.mock('@/db/schema', () => ({
    learnings: { id: 'id', userId: 'user_id', mutedAt: 'muted_at' },
    learningScopes: { learningId: 'learning_id', scope: 'scope' },
    embeddings1536: { learningId: 'learning_id', embedding: 'embedding', modelName: 'model_name' },
    embeddings384: { learningId: 'learning_id', embedding: 'embedding', modelName: 'model_name' },
}))

import { searchByEmbedding, setEmbedding, hasEmbedding } from '@/lib/nebula/embeddings'
import { NebulaError } from '@/lib/nebula/errors'

describe('searchByEmbedding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockExecute.mockResolvedValue([])
    })

    it('throws CROSS_LENS_DENIED when include is empty and allowCrossLens=false', async () => {
        await expect(
            searchByEmbedding('user-1', [0.1], 384, { include: [], exclude: [], boost: [] }, 10, false)
        ).rejects.toThrow(NebulaError)
    })

    it('does NOT throw when include is empty but allowCrossLens=true', async () => {
        await expect(
            searchByEmbedding('user-1', [0.1], 384, { include: [], exclude: [], boost: [] }, 10, true)
        ).resolves.not.toThrow()
    })

    it('does NOT throw when include is non-empty and allowCrossLens=false', async () => {
        await expect(
            searchByEmbedding('user-1', [0.1], 384, { include: ['#typescript'], exclude: [], boost: [] }, 10, false)
        ).resolves.not.toThrow()
    })

    it('returns ScoredLearning with correct scoring formula (in-scope)', async () => {
        mockExecute.mockResolvedValue([{
            id: 'l-1', user_id: 'user-1', team_id: null, content: 'test',
            type: 'pattern', confidence_base: 0.5, confidence: 0.5,
            extraction_method: 'manual', source_conversation_id: null,
            refined_from: null, pinned_at: null, muted_at: null,
            usage_count: 1, last_used_at: null, promoted_at: null,
            created_at: new Date(), updated_at: new Date(),
            semantic_score: 0.9, is_cross_lens: false,
        }])

        const result = await searchByEmbedding(
            'user-1', [0.1], 384, { include: ['#ts'], exclude: [], boost: [] }, 10, false
        )
        expect(result).toHaveLength(1)
        // score = semantic * 0.7 + scopeMatch * 0.3 = 0.9*0.7 + 1*0.3 = 0.93
        expect(result[0]!.score).toBeCloseTo(0.93, 2)
        expect(result[0]!.scopeMatchScore).toBe(1)
    })

    it('sets scopeMatchScore to 0 for cross-lens results', async () => {
        mockExecute.mockResolvedValue([{
            id: 'l-1', user_id: 'user-1', team_id: null, content: 'test',
            type: 'pattern', confidence_base: 0.5, confidence: 0.5,
            extraction_method: 'manual', source_conversation_id: null,
            refined_from: null, pinned_at: null, muted_at: null,
            usage_count: 0, last_used_at: null, promoted_at: null,
            created_at: new Date(), updated_at: new Date(),
            semantic_score: 0.8, is_cross_lens: true,
        }])

        const result = await searchByEmbedding(
            'user-1', [0.1], 384, { include: ['#ts'], exclude: [], boost: [] }, 10, true
        )
        expect(result[0]!.scopeMatchScore).toBe(0)
        // score = 0.8*0.7 + 0*0.3 = 0.56
        expect(result[0]!.score).toBeCloseTo(0.56, 2)
    })
})

describe('setEmbedding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockInsert.mockReturnValue({ values: mockValues })
        mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict })
        mockOnConflict.mockResolvedValue(undefined)
    })

    it('calls insert for 1536-dim embeddings', async () => {
        await setEmbedding('l-1', new Array(1536).fill(0.1), 1536, 'text-embedding-3-small')
        expect(mockInsert).toHaveBeenCalled()
    })

    it('calls insert for 384-dim embeddings', async () => {
        await setEmbedding('l-1', new Array(384).fill(0.1), 384, 'nomic-embed-text')
        expect(mockInsert).toHaveBeenCalled()
    })
})

describe('hasEmbedding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSelect.mockReturnValue({ from: mockFrom })
        mockFrom.mockReturnValue({ where: mockWhere })
        mockWhere.mockReturnValue({ limit: mockLimit })
    })

    it('returns false when no embedding exists', async () => {
        mockLimit.mockResolvedValue([])
        expect(await hasEmbedding('l-1', 1536)).toBe(false)
    })

    it('returns true when embedding exists', async () => {
        mockLimit.mockResolvedValue([{ learningId: 'l-1' }])
        expect(await hasEmbedding('l-1', 1536)).toBe(true)
    })
})
