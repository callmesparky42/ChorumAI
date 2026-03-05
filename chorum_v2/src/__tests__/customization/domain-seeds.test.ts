import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn()
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockDeleteWhere = vi.fn(() => Promise.resolve())
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockUpdateReturning,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockDeleteWhere,
    mockDelete,
  }
})

vi.mock('@/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    update: mocks.mockUpdate,
    delete: mocks.mockDelete,
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: vi.fn(() => ({})),
  }
})

import {
  createSeed,
  deleteSeed,
  updateSeed,
} from '@/lib/customization/domain-seeds'

describe('customization/domain-seeds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSelectWhere.mockResolvedValue([])
  })

  it('creates seed and returns row with id', async () => {
    mocks.mockInsertReturning.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      label: 'coding',
      signalKeywords: ['code'],
      preferredTypes: { invariant: 1 },
      isSystem: false,
    }])

    const result = await createSeed({
      label: 'coding',
      signalKeywords: ['code'],
      preferredTypes: { invariant: 1 },
      isSystem: false,
    })

    expect(result?.id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it("rejects seed creation for label 'general'", async () => {
    await expect(createSeed({
      label: 'general',
      signalKeywords: ['misc'],
      preferredTypes: { pattern: 1 },
      isSystem: false,
    })).rejects.toThrow()
  })

  it('updates only provided fields', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([{
      id: '22222222-2222-4222-8222-222222222222',
      label: 'coding',
      signalKeywords: ['typescript'],
      preferredTypes: { invariant: 1 },
      isSystem: false,
    }])

    const result = await updateSeed('22222222-2222-4222-8222-222222222222', {
      signalKeywords: ['typescript'],
    })

    expect(result?.signalKeywords).toEqual(['typescript'])
  })

  it('blocks deletion of system seed', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: '33333333-3333-4333-8333-333333333333',
      label: 'coding',
      isSystem: true,
    }])

    await expect(deleteSeed('33333333-3333-4333-8333-333333333333')).rejects.toThrow(
      'Cannot delete system seeds',
    )
  })

  it('deletes non-system seed', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      label: 'custom-domain',
      isSystem: false,
    }])

    await expect(deleteSeed('44444444-4444-4444-8444-444444444444')).resolves.toBe(true)
    expect(mocks.mockDeleteWhere).toHaveBeenCalledOnce()
  })
})
