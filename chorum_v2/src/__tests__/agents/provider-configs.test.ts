import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn(() => Promise.resolve([]))
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  let lastInsertValues: Record<string, unknown> | null = null

  const mockInsertReturning = vi.fn(() => {
    const values = lastInsertValues ?? {}
    return Promise.resolve([{
      id: 'cfg-1',
      userId: values.userId ?? 'user-1',
      provider: values.provider ?? 'openai',
      apiKeyEnc: values.apiKeyEnc ?? '',
      modelOverride: values.modelOverride ?? null,
      baseUrl: values.baseUrl ?? null,
      isLocal: values.isLocal ?? false,
      isEnabled: true,
      priority: values.priority ?? 0,
    }])
  })

  const mockInsertValues = vi.fn((values: Record<string, unknown>) => {
    lastInsertValues = values
    return { returning: mockInsertReturning }
  })
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateWhere = vi.fn(() => Promise.resolve())
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockDeleteWhere = vi.fn(() => Promise.resolve())
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
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

import {
  deleteProviderConfig,
  disableProvider,
  getUserProviders,
  saveProviderConfig,
} from '@/lib/agents/provider-configs'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('agents/provider-configs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
    mocks.mockSelectWhere.mockResolvedValue([])
  })

  it('saveProviderConfig encrypts API key and normalizes provider aliases', async () => {
    await saveProviderConfig(USER_ID, {
      provider: 'Gemini',
      apiKey: 'plain-secret',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      priority: 0,
    })

    const inserted = mocks.mockInsertValues.mock.calls[0]?.[0] as { apiKeyEnc: string }
    expect(inserted.apiKeyEnc).toBeDefined()
    expect(inserted.apiKeyEnc).not.toContain('plain-secret')
    expect((mocks.mockInsertValues.mock.calls[0]?.[0] as { provider: string }).provider).toBe('google')
  })

  it('getUserProviders decrypts stored API key and normalizes provider ids', async () => {
    const saved = await saveProviderConfig(USER_ID, {
      provider: 'openai',
      apiKey: 'plain-secret',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      priority: 0,
    })

    const encrypted = (mocks.mockInsertValues.mock.calls[0]?.[0] as { apiKeyEnc: string }).apiKeyEnc
    mocks.mockSelectWhere.mockResolvedValue([{
      id: 'cfg-1',
      userId: USER_ID,
      provider: 'Google',
      apiKeyEnc: encrypted,
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      isEnabled: true,
      priority: 0,
      createdAt: new Date('2026-03-22T00:00:00Z'),
      updatedAt: new Date('2026-03-22T00:00:00Z'),
    }] as never)

    const rows = await getUserProviders(USER_ID)
    expect(rows[0]?.apiKey).toBe('plain-secret')
    expect(rows[0]?.provider).toBe('google')
    expect(saved.apiKey).toBe('plain-secret')
  })

  it('disableProvider resolves aliases before update', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: 'cfg-1',
      userId: USER_ID,
      provider: 'Google',
      apiKeyEnc: 'ignored',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      isEnabled: true,
      priority: 0,
      createdAt: new Date('2026-03-22T00:00:00Z'),
      updatedAt: new Date('2026-03-22T00:00:00Z'),
    }] as never)

    await disableProvider(USER_ID, 'gemini')
    expect(mocks.mockUpdateWhere).toHaveBeenCalledOnce()
  })

  it('deleteProviderConfig removes provider row by normalized id', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: 'cfg-1',
      userId: USER_ID,
      provider: 'Google',
      apiKeyEnc: 'ignored',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      isEnabled: true,
      priority: 0,
      createdAt: new Date('2026-03-22T00:00:00Z'),
      updatedAt: new Date('2026-03-22T00:00:00Z'),
    }] as never)

    await deleteProviderConfig(USER_ID, 'gemini')
    expect(mocks.mockDeleteWhere).toHaveBeenCalledOnce()
  })
})
