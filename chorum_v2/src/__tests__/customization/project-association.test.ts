import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn()
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  return { mockWhere, mockFrom, mockSelect }
})

vi.mock('@/db', () => ({
  db: {
    select: mocks.mockSelect,
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: vi.fn(() => ({})),
  }
})

import { findProjectByScopes } from '@/lib/customization/project-association'

describe('customization/project-association', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns best matching project by overlap', async () => {
    mocks.mockWhere.mockResolvedValue([
      {
        id: 'p1',
        name: 'Codebase',
        scopeFilter: { include: ['#coding', '#typescript'], exclude: [] },
      },
      {
        id: 'p2',
        name: 'Writing',
        scopeFilter: { include: ['#writing'], exclude: [] },
      },
    ])

    const result = await findProjectByScopes(['#coding'], 'user-1')
    expect(result?.name).toBe('Codebase')
  })

  it('returns null when there is no overlap', async () => {
    mocks.mockWhere.mockResolvedValue([
      {
        id: 'p1',
        name: 'Writing',
        scopeFilter: { include: ['#writing'], exclude: [] },
      },
    ])

    const result = await findProjectByScopes(['#trading'], 'user-1')
    expect(result).toBeNull()
  })
})
