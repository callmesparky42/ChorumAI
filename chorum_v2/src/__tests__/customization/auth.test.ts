import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn()
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockUpdateWhere = vi.fn(() => Promise.resolve(undefined))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
  }
})

vi.mock('@/db', () => ({
  db: {
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}))

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    and: vi.fn(() => ({})),
    eq: vi.fn(() => ({})),
    gt: vi.fn(() => ({})),
    isNull: vi.fn(() => ({})),
    or: vi.fn(() => ({})),
  }
})

import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authenticate, enforceOwnership, hasScope } from '@/lib/customization/auth'
import type { AuthContext } from '@/lib/customization/types'

describe('customization/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSelectWhere.mockResolvedValue([])
    vi.mocked(getServerSession).mockResolvedValue(null)
    vi.mocked(bcrypt.compare as any).mockResolvedValue(false)
  })

  it('returns AuthContext for valid bearer token', async () => {
    const tokenRow = {
      id: 'token-1',
      userId: '11111111-1111-4111-8111-111111111111',
      hashedToken: 'hashed-token',
      scopes: ['read:nebula', 'write:feedback'],
      expiresAt: null,
      revokedAt: null,
    }
    mocks.mockSelectWhere.mockResolvedValue([tokenRow])
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true)

    const req = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer plaintext-token' },
    })

    const result = await authenticate(req)

    expect(result).toEqual({
      userId: tokenRow.userId,
      scopes: tokenRow.scopes,
    })
  })

  it('rejects expired token', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: 'token-1',
      userId: '11111111-1111-4111-8111-111111111111',
      hashedToken: 'hashed-token',
      scopes: ['read:nebula'],
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
    }])
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true)

    const req = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer plaintext-token' },
    })

    await expect(authenticate(req)).resolves.toBeNull()
  })

  it('rejects revoked token', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: 'token-1',
      userId: '11111111-1111-4111-8111-111111111111',
      hashedToken: 'hashed-token',
      scopes: ['read:nebula'],
      expiresAt: null,
      revokedAt: new Date(),
    }])
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true)

    const req = new Request('http://localhost/api/mcp', {
      headers: { Authorization: 'Bearer plaintext-token' },
    })

    await expect(authenticate(req)).resolves.toBeNull()
  })

  it('returns null when Authorization header is missing', async () => {
    const req = new Request('http://localhost/api/mcp')
    await expect(authenticate(req)).resolves.toBeNull()
  })

  it('hasScope returns true for read_nebula when read:nebula scope exists', () => {
    const auth: AuthContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['read:nebula'],
    }
    expect(hasScope(auth, 'read_nebula')).toBe(true)
  })

  it('hasScope returns false for inject_learning when only read scope exists', () => {
    const auth: AuthContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['read:nebula'],
    }
    expect(hasScope(auth, 'inject_learning')).toBe(false)
  })

  it('enforceOwnership rejects mismatched userId', () => {
    const auth: AuthContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['read:nebula'],
    }
    expect(enforceOwnership(auth, '22222222-2222-4222-8222-222222222222')).toBe(false)
  })

  it('enforceOwnership allows admin override', () => {
    const auth: AuthContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      scopes: ['admin'],
    }
    expect(enforceOwnership(auth, '22222222-2222-4222-8222-222222222222')).toBe(true)
  })
})
