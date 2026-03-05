// src/__tests__/nebula/dedup.test.ts
// Unit tests for Nebula dedup module — threshold constant and merge logic
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockExecute, mockUpdate, mockSet, mockWhere } = vi.hoisted(() => {
    const mockExecute = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockWhere = vi.fn()

    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })
    mockWhere.mockResolvedValue(undefined)

    return { mockExecute, mockUpdate, mockSet, mockWhere }
})

vi.mock('@/db', () => ({
    db: { execute: mockExecute, update: mockUpdate },
}))

vi.mock('@/db/schema', () => ({
    learnings: { id: 'id' },
    embeddings1536: {},
    embeddings384: {},
}))

import { DEDUP_THRESHOLD, findNearDuplicate, mergeWithExisting } from '@/lib/nebula/dedup'

describe('DEDUP_THRESHOLD', () => {
    it('is 0.85 (cosine similarity)', () => {
        expect(DEDUP_THRESHOLD).toBe(0.85)
    })
})

describe('findNearDuplicate', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns isDuplicate=false when no results', async () => {
        mockExecute.mockResolvedValue([])
        const result = await findNearDuplicate('user-1', 'pattern', [0.1, 0.2], 384)
        expect(result).toEqual({ isDuplicate: false, existingId: null })
    })

    it('returns isDuplicate=false when similarity is below threshold', async () => {
        mockExecute.mockResolvedValue([{ learning_id: 'l-1', similarity: 0.84 }])
        const result = await findNearDuplicate('user-1', 'pattern', [0.1, 0.2], 384)
        expect(result).toEqual({ isDuplicate: false, existingId: null })
    })

    it('returns isDuplicate=true when similarity meets threshold exactly', async () => {
        mockExecute.mockResolvedValue([{ learning_id: 'l-1', similarity: 0.85 }])
        const result = await findNearDuplicate('user-1', 'pattern', [0.1, 0.2], 384)
        expect(result).toEqual({ isDuplicate: true, existingId: 'l-1' })
    })

    it('returns isDuplicate=true when similarity exceeds threshold', async () => {
        mockExecute.mockResolvedValue([{ learning_id: 'l-1', similarity: 0.99 }])
        const result = await findNearDuplicate('user-1', 'pattern', [0.1], 1536)
        expect(result).toEqual({ isDuplicate: true, existingId: 'l-1' })
    })
})

describe('mergeWithExisting', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdate.mockReturnValue({ set: mockSet })
        mockSet.mockReturnValue({ where: mockWhere })
        mockWhere.mockResolvedValue(undefined)
    })

    it('updates content and sets refinedFrom lineage', async () => {
        await mergeWithExisting('existing-id', 'new wording', 'incoming-id')
        expect(mockUpdate).toHaveBeenCalled()
        const setArg = mockSet.mock.calls[0]![0]
        expect(setArg.content).toBe('new wording')
        expect(setArg.refinedFrom).toBe('incoming-id')
        expect(setArg.updatedAt).toBeInstanceOf(Date)
    })

    it('omits refinedFrom when incomingId is not provided', async () => {
        await mergeWithExisting('existing-id', 'new wording')
        const setArg = mockSet.mock.calls[0]![0]
        expect(setArg.content).toBe('new wording')
        expect(setArg).not.toHaveProperty('refinedFrom')
    })
})
