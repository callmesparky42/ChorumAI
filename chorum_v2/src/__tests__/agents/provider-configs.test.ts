import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn()
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

  const mockInsertOnConflict = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsertValues = vi.fn((values: Record<string, unknown>) => {
    lastInsertValues = values
    return { onConflictDoUpdate: mockInsertOnConflict }
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
  })

  it('saveProviderConfig encrypts API key', async () => {
    await saveProviderConfig(USER_ID, {
      provider: 'openai',
      apiKey: 'plain-secret',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      priority: 0,
    })

    const inserted = mocks.mockInsertValues.mock.calls[0]?.[0] as { apiKeyEnc: string }
    expect(inserted.apiKeyEnc).toBeDefined()
    expect(inserted.apiKeyEnc).not.toContain('plain-secret')
  })

  it('getUserProviders decrypts stored API key', async () => {
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
      provider: 'openai',
      apiKeyEnc: encrypted,
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      isEnabled: true,
      priority: 0,
    }])

    const rows = await getUserProviders(USER_ID)
    expect(rows[0]?.apiKey).toBe('plain-secret')
    expect(saved.apiKey).toBe('plain-secret')
  })

  it('disableProvider sets isEnabled false', async () => {
    await disableProvider(USER_ID, 'openai')
    expect(mocks.mockUpdateWhere).toHaveBeenCalledOnce()
  })

  it('upsert same provider updates instead of duplicating', async () => {
    await saveProviderConfig(USER_ID, {
      provider: 'openai',
      apiKey: 'first',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      priority: 0,
    })

    await saveProviderConfig(USER_ID, {
      provider: 'openai',
      apiKey: 'second',
      modelOverride: null,
      baseUrl: null,
      isLocal: false,
      priority: 1,
    })

    expect(mocks.mockInsert.mock.calls.length).toBe(2)
  })

  it('deleteProviderConfig removes provider row', async () => {
    await deleteProviderConfig(USER_ID, 'openai')
    expect(mocks.mockDeleteWhere).toHaveBeenCalledOnce()
  })
})
