import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockWhere = vi.fn()
  const mockFrom = vi.fn()
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

import { detectScopes } from '@/lib/customization/scope-detection'

describe('customization/scope-detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockWhere.mockResolvedValue([])
  })

  it('detects #coding for coding keyword text', async () => {
    mocks.mockFrom
      .mockResolvedValueOnce([
        { label: 'coding', signalKeywords: ['python', 'function', 'debug'] },
      ])
      .mockReturnValueOnce({ where: mocks.mockWhere })

    const scopes = await detectScopes('debug this python function please', 'user-1')
    expect(scopes).toContain('#coding')
  })

  it('detects #writing for writing keyword text', async () => {
    mocks.mockFrom
      .mockResolvedValueOnce([
        { label: 'writing', signalKeywords: ['character', 'arc', 'plot'] },
      ])
      .mockReturnValueOnce({ where: mocks.mockWhere })

    const scopes = await detectScopes('develop Alice character arc and plot', 'user-1')
    expect(scopes).toContain('#writing')
  })

  it('returns empty array for no keyword matches', async () => {
    mocks.mockFrom
      .mockResolvedValueOnce([
        { label: 'coding', signalKeywords: ['python', 'function', 'debug'] },
      ])
      .mockReturnValueOnce({ where: mocks.mockWhere })

    const scopes = await detectScopes('hello how are you', 'user-1')
    expect(scopes).toEqual([])
  })

  it('requires at least two keyword matches for a seed hit', async () => {
    mocks.mockFrom
      .mockResolvedValueOnce([
        { label: 'coding', signalKeywords: ['python', 'function', 'debug'] },
      ])
      .mockReturnValueOnce({ where: mocks.mockWhere })

    const scopes = await detectScopes('single python mention only', 'user-1')
    expect(scopes).toEqual([])
  })
})
