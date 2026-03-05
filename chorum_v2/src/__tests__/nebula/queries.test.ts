// src/__tests__/nebula/queries.test.ts
// Unit tests for Nebula Layer 0 — queries module
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ---- vi.hoisted mock factories ----
const {
    mockInsert, mockValues, mockReturning, mockFindFirst,
    mockUpdate, mockSet, mockWhere, mockDelete,
    mockSelectDistinct, mockFrom, mockInnerJoin,
} = vi.hoisted(() => {
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockFindFirst = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockWhere = vi.fn()
    const mockDelete = vi.fn()
    const mockSelectDistinct = vi.fn()
    const mockFrom = vi.fn()
    const mockInnerJoin = vi.fn()

    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning, onConflictDoUpdate: vi.fn() })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockWhere.mockReturnValue({ returning: mockReturning })
    mockDelete.mockReturnValue({ where: vi.fn() })
    mockSelectDistinct.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin })
    mockInnerJoin.mockReturnValue({ where: mockWhere })

    return {
        mockInsert, mockValues, mockReturning, mockFindFirst,
        mockUpdate, mockSet, mockWhere, mockDelete,
        mockSelectDistinct, mockFrom, mockInnerJoin,
    }
})

vi.mock('@/db', () => ({
    db: {
        insert: mockInsert,
        update: mockUpdate,
        delete: mockDelete,
        selectDistinct: mockSelectDistinct,
        query: { learnings: { findFirst: mockFindFirst } },
    },
}))

vi.mock('@/db/schema', () => ({
    learnings: { id: 'id', userId: 'user_id', type: 'type' },
    learningScopes: { learningId: 'learning_id', scope: 'scope' },
    embeddings1536: {},
    embeddings384: {},
}))

vi.mock('@/lib/nebula/dedup', () => ({
    findNearDuplicate: vi.fn().mockResolvedValue({ isDuplicate: false, existingId: null }),
    mergeWithExisting: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/nebula/embeddings', () => ({
    setEmbedding: vi.fn().mockResolvedValue(undefined),
}))

import { createLearning, getLearning, updateLearning } from '@/lib/nebula/queries'
import { findNearDuplicate, mergeWithExisting } from '@/lib/nebula/dedup'
import { NebulaError } from '@/lib/nebula/errors'
import type { CreateLearningInput } from '@/lib/nebula/interface'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date()

const baseRow = {
    id: 'test-id-001', userId: 'user-1', teamId: null,
    content: 'Use async/await over raw promises.', type: 'pattern',
    confidenceBase: 0.5, confidence: 0.5, extractionMethod: 'manual',
    sourceConversationId: null, refinedFrom: null,
    pinnedAt: null, mutedAt: null, usageCount: 0,
    lastUsedAt: null, promotedAt: null, createdAt: now, updatedAt: now,
}

const baseInput: CreateLearningInput = {
    userId: 'user-1', content: 'Use async/await over raw promises.',
    type: 'pattern', extractionMethod: 'manual', scopes: ['#typescript'],
}

// ---------------------------------------------------------------------------
// createLearning
// ---------------------------------------------------------------------------

describe('createLearning', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Re-wire chain after clearAllMocks
        mockInsert.mockReturnValue({ values: mockValues })
        mockValues.mockReturnValue({ returning: mockReturning, onConflictDoUpdate: vi.fn() })
        mockReturning.mockResolvedValue([baseRow])
    })

    it('rejects #general scope tag with DUPLICATE_SCOPE_TAG error', async () => {
        const input = { ...baseInput, scopes: ['#general'] }
        await expect(createLearning(input)).rejects.toThrow(NebulaError)
        await expect(createLearning(input)).rejects.toThrow('#general')
    })

    it('creates a learning with default confidence 0.5', async () => {
        const result = await createLearning(baseInput)
        expect(result.confidenceBase).toBe(0.5)
        expect(result.confidence).toBe(0.5)
    })

    it('inserts scope tags when provided', async () => {
        await createLearning({ ...baseInput, scopes: ['#typescript', '#patterns'] })
        expect(mockInsert).toHaveBeenCalledTimes(2) // learnings + learningScopes
    })

    it('skips scope insert when scopes is empty', async () => {
        await createLearning({ ...baseInput, scopes: [] })
        expect(mockInsert).toHaveBeenCalledTimes(1) // learnings only
    })

    it('calls findNearDuplicate when embedding is provided', async () => {
        const input = {
            ...baseInput,
            embedding: [0.1, 0.2], embeddingDims: 384 as const,
            embeddingModel: 'nomic-embed-text',
        }
        await createLearning(input)
        expect(findNearDuplicate).toHaveBeenCalledWith('user-1', 'pattern', [0.1, 0.2], 384)
    })

    it('merges with existing when dedup finds a duplicate', async () => {
        ; (findNearDuplicate as ReturnType<typeof vi.fn>).mockResolvedValue({
            isDuplicate: true, existingId: 'existing-id',
        })
        mockFindFirst.mockResolvedValue(baseRow)

        const input = {
            ...baseInput, embedding: [0.1, 0.2], embeddingDims: 384 as const,
        }
        const result = await createLearning(input)
        expect(mergeWithExisting).toHaveBeenCalled()
        expect(result.id).toBe(baseRow.id)
    })
})

// ---------------------------------------------------------------------------
// getLearning
// ---------------------------------------------------------------------------

describe('getLearning', () => {
    it('returns null when not found', async () => {
        mockFindFirst.mockResolvedValue(null)
        expect(await getLearning('nonexistent')).toBeNull()
    })

    it('returns mapped Learning when found', async () => {
        mockFindFirst.mockResolvedValue(baseRow)
        const result = await getLearning(baseRow.id)
        expect(result!.id).toBe(baseRow.id)
        expect(result!.type).toBe('pattern')
    })
})

// ---------------------------------------------------------------------------
// updateLearning
// ---------------------------------------------------------------------------

describe('updateLearning', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdate.mockReturnValue({ set: mockSet })
        mockSet.mockReturnValue({ where: mockWhere })
        mockWhere.mockReturnValue({ returning: mockReturning })
        mockReturning.mockResolvedValue([{ ...baseRow, content: 'updated' }])
    })

    it('throws NOT_FOUND when learning does not exist', async () => {
        mockReturning.mockResolvedValue([])
        await expect(updateLearning('nonexistent', { content: 'x' })).rejects.toThrow(NebulaError)
    })

    it('returns updated learning', async () => {
        const result = await updateLearning(baseRow.id, { content: 'updated' })
        expect(result.content).toBe('updated')
    })
})
