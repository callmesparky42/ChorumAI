// src/__tests__/nebula/cooccurrence.test.ts
// Unit tests for cooccurrence ordered-pair logic
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockInsert, mockValues, mockOnConflictDoUpdate, mockSelect } = vi.hoisted(() => {
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockOnConflictDoUpdate = vi.fn()
    const mockSelect = vi.fn()

    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
    mockOnConflictDoUpdate.mockResolvedValue(undefined)

    const limitFn = vi.fn().mockResolvedValue([])
    const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
    const fromFn = vi.fn().mockReturnValue({ where: whereFn })
    mockSelect.mockReturnValue({ from: fromFn })

    return { mockInsert, mockValues, mockOnConflictDoUpdate, mockSelect }
})

vi.mock('@/db', () => ({
    db: { insert: mockInsert, select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
    cooccurrence: {
        learningA: 'learning_a', learningB: 'learning_b', count: 'count',
    },
}))

import { recordCooccurrence, getCohort } from '@/lib/nebula/cooccurrence'

describe('recordCooccurrence', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockInsert.mockReturnValue({ values: mockValues })
        mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
        mockOnConflictDoUpdate.mockResolvedValue(undefined)
    })

    it('does nothing for fewer than 2 IDs', async () => {
        await recordCooccurrence(['only-one'])
        expect(mockInsert).not.toHaveBeenCalled()
    })

    it('does nothing for empty array', async () => {
        await recordCooccurrence([])
        expect(mockInsert).not.toHaveBeenCalled()
    })

    it('generates 1 pair for 2 IDs', async () => {
        await recordCooccurrence(['id-a', 'id-b'])
        expect(mockInsert).toHaveBeenCalledTimes(1)
    })

    it('generates 3 pairs for 3 IDs (combinatorial)', async () => {
        await recordCooccurrence(['id-a', 'id-b', 'id-c'])
        expect(mockInsert).toHaveBeenCalledTimes(3)
    })

    it('generates 6 pairs for 4 IDs', async () => {
        await recordCooccurrence(['a', 'b', 'c', 'd'])
        expect(mockInsert).toHaveBeenCalledTimes(6)
    })

    it('orders pairs lexicographically (a < b)', async () => {
        await recordCooccurrence(['zzz', 'aaa'])
        const insertedValues = mockValues.mock.calls[0]![0]
        expect(insertedValues.learningA).toBe('aaa')
        expect(insertedValues.learningB).toBe('zzz')
    })

    it('uses upsert with onConflictDoUpdate', async () => {
        await recordCooccurrence(['id-a', 'id-b'])
        expect(mockOnConflictDoUpdate).toHaveBeenCalled()
    })
})

describe('getCohort', () => {
    it('returns the OTHER member of each pair, not the queried ID', async () => {
        const mockRows = [
            { learningA: 'target', learningB: 'other-1', count: 5, positiveCount: 3, negativeCount: 1, lastSeen: new Date() },
            { learningA: 'other-2', learningB: 'target', count: 3, positiveCount: 1, negativeCount: 0, lastSeen: new Date() },
        ]

        const limitFn = vi.fn().mockResolvedValue(mockRows)
        const orderByFn = vi.fn().mockReturnValue({ limit: limitFn })
        const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn })
        const fromFn = vi.fn().mockReturnValue({ where: whereFn })
        mockSelect.mockReturnValue({ from: fromFn })

        const result = await getCohort('target', 10)
        expect(result[0]!.learningId).toBe('other-1')
        expect(result[1]!.learningId).toBe('other-2')
    })
})
