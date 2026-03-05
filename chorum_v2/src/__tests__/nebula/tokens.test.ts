// src/__tests__/nebula/tokens.test.ts
// Unit tests for Nebula API token module
import { vi, describe, it, expect, beforeEach } from 'vitest'

const {
    mockCompare, mockHash, mockRandomBytes,
    mockSelect, mockFrom, mockWhere,
    mockInsert, mockValues, mockReturning,
    mockUpdate, mockSet, mockUpdateWhere,
} = vi.hoisted(() => {
    const mockCompare = vi.fn()
    const mockHash = vi.fn().mockResolvedValue('$2a$12$mockhashedtoken')
    const mockRandomBytes = vi.fn().mockReturnValue({ toString: () => 'a'.repeat(64) })

    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockUpdateWhere = vi.fn()

    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere })
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockUpdateWhere })

    return {
        mockCompare, mockHash, mockRandomBytes,
        mockSelect, mockFrom, mockWhere,
        mockInsert, mockValues, mockReturning,
        mockUpdate, mockSet, mockUpdateWhere,
    }
})

vi.mock('bcryptjs', () => ({
    hash: mockHash,
    compare: mockCompare,
}))

vi.mock('crypto', () => ({
    randomBytes: mockRandomBytes,
}))

vi.mock('@/db', () => ({
    db: {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
    },
}))

vi.mock('@/db/schema', () => ({
    apiTokens: { id: 'id', revokedAt: 'revoked_at' },
}))

import { validateApiToken, createApiToken, revokeApiToken } from '@/lib/nebula/tokens'

const now = new Date()
const futureDate = new Date(now.getTime() + 86_400_000)
const pastDate = new Date(now.getTime() - 86_400_000)

const tokenRow = {
    id: 'tok-1', userId: 'user-1', name: 'my-token',
    hashedToken: '$2a$12$mockhashedtoken',
    scopes: ['read:nebula', 'write:nebula'],
    lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: now,
}

describe('validateApiToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSelect.mockReturnValue({ from: mockFrom })
        mockFrom.mockReturnValue({ where: mockWhere })
        mockWhere.mockResolvedValue([tokenRow])
        mockUpdate.mockReturnValue({ set: mockSet })
        mockSet.mockReturnValue({ where: mockUpdateWhere })
        mockUpdateWhere.mockResolvedValue(undefined)
    })

    it('returns token record when bcrypt compare matches', async () => {
        mockCompare.mockResolvedValue(true)
        const result = await validateApiToken('plain-token')
        expect(result).not.toBeNull()
        expect(result!.id).toBe('tok-1')
        expect(result!.userId).toBe('user-1')
    })

    it('returns null when bcrypt compare fails', async () => {
        mockCompare.mockResolvedValue(false)
        const result = await validateApiToken('wrong-token')
        expect(result).toBeNull()
    })

    it('skips expired tokens', async () => {
        mockWhere.mockResolvedValue([{ ...tokenRow, expiresAt: pastDate }])
        mockCompare.mockResolvedValue(true)
        const result = await validateApiToken('plain-token')
        expect(result).toBeNull()
        expect(mockCompare).not.toHaveBeenCalled()
    })

    it('accepts unexpired tokens', async () => {
        mockWhere.mockResolvedValue([{ ...tokenRow, expiresAt: futureDate }])
        mockCompare.mockResolvedValue(true)
        const result = await validateApiToken('plain-token')
        expect(result).not.toBeNull()
    })

    it('returns null when no active tokens exist', async () => {
        mockWhere.mockResolvedValue([])
        const result = await validateApiToken('any-token')
        expect(result).toBeNull()
    })
})

describe('createApiToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockInsert.mockReturnValue({ values: mockValues })
        mockValues.mockReturnValue({ returning: mockReturning })
        mockReturning.mockResolvedValue([tokenRow])
    })

    it('returns a plain-text token and stored record', async () => {
        const result = await createApiToken({
            userId: 'user-1', name: 'my-token', scopes: ['read:nebula'],
        })
        expect(result.token).toHaveLength(64)
        expect(result.record.id).toBe('tok-1')
    })

    it('throws when insert returns no row', async () => {
        mockReturning.mockResolvedValue([])
        await expect(
            createApiToken({ userId: 'user-1', name: 'test', scopes: [] })
        ).rejects.toThrow('Token insert returned no row')
    })
})

describe('revokeApiToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdate.mockReturnValue({ set: mockSet })
        mockSet.mockReturnValue({ where: mockUpdateWhere })
        mockUpdateWhere.mockResolvedValue(undefined)
    })

    it('sets revokedAt to current date', async () => {
        await revokeApiToken('tok-1')
        expect(mockUpdate).toHaveBeenCalled()
        const setArg = mockSet.mock.calls[0]![0]
        expect(setArg.revokedAt).toBeInstanceOf(Date)
    })
})
