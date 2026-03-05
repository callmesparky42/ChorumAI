import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn()
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockInsertOnConflict = vi.fn(() => Promise.resolve())
  const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockInsertOnConflict }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  return {
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertOnConflict,
    mockInsertValues,
    mockInsert,
  }
})

vi.mock('@/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
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
  getEffectiveHalfLife,
  updateUserCustomization,
} from '@/lib/customization/config'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('customization/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSelectWhere.mockResolvedValue([])
  })

  it('returns system default half-life when user has no config', async () => {
    const result = await getEffectiveHalfLife(USER_ID, 'pattern')
    expect(result).toBe(90)
  })

  it('returns user override half-life when present', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      customization: {
        halfLifeOverrides: { pattern: 120 },
      },
    }])

    const result = await getEffectiveHalfLife(USER_ID, 'pattern')
    expect(result).toBe(120)
  })

  it('updateUserCustomization merges updates instead of replacing existing config', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      customization: {
        halfLifeOverrides: { pattern: 120 },
        confidenceFloorOverrides: { pattern: 0.2 },
      },
    }])

    const updated = await updateUserCustomization(USER_ID, {
      qualityThreshold: 0.5,
    })

    expect(updated).toEqual({
      halfLifeOverrides: { pattern: 120 },
      confidenceFloorOverrides: { pattern: 0.2 },
      qualityThreshold: 0.5,
    })
    expect(mocks.mockInsertOnConflict).toHaveBeenCalledOnce()
  })
})
