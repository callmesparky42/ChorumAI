import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockSelectWhere = vi.fn()
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockDeleteWhere = vi.fn(() => Promise.resolve())
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockDeleteWhere,
    mockDelete,
  }
})

vi.mock('@/db', () => ({
  db: {
    select: mocks.mockSelect,
    insert: mocks.mockInsert,
    delete: mocks.mockDelete,
  },
}))

import { createPersona, deletePersona, getPersonas } from '@/lib/agents/personas'

describe('agents/personas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getPersonas returns system + user personas', async () => {
    mocks.mockSelectWhere.mockResolvedValue([
      {
        id: '1',
        name: 'default',
        description: '',
        scopeFilter: { include: [], exclude: [], boost: [] },
        systemPrompt: 'system',
        defaultProvider: null,
        defaultModel: null,
        temperature: 0.7,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: true,
        isActive: true,
      },
      {
        id: '2',
        name: 'custom',
        description: 'my persona',
        scopeFilter: { include: ['#coding'], exclude: [], boost: [] },
        systemPrompt: 'custom',
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: false,
        isActive: true,
      },
    ])

    const personas = await getPersonas('user-1')
    expect(personas).toHaveLength(2)
    expect(personas.some((persona) => persona.isSystem)).toBe(true)
    expect(personas.some((persona) => persona.name === 'custom')).toBe(true)
  })

  it('createPersona creates user persona with isSystem false', async () => {
    mocks.mockInsertReturning.mockResolvedValue([{
      id: '3',
      userId: 'user-1',
      name: 'builder',
      description: '',
      scopeFilter: { include: [], exclude: [], boost: [] },
      systemPrompt: 'builder prompt',
      defaultProvider: null,
      defaultModel: null,
      temperature: 0.7,
      maxTokens: 4096,
      allowedTools: [],
      isSystem: false,
      isActive: true,
    }])

    const persona = await createPersona('user-1', {
      name: 'builder',
      description: '',
      systemPrompt: 'builder prompt',
      defaultProvider: null,
      defaultModel: null,
      temperature: 0.7,
      maxTokens: 4096,
      scopeFilter: { include: [], exclude: [], boost: [] },
      allowedTools: [],
    })

    expect(persona.id).toBe('3')
    expect(persona.isSystem).toBe(false)
  })

  it('deletePersona returns false for system persona', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: '1',
      name: 'default',
      description: '',
      scopeFilter: { include: [], exclude: [], boost: [] },
      systemPrompt: 'system',
      defaultProvider: null,
      defaultModel: null,
      temperature: 0.7,
      maxTokens: 4096,
      allowedTools: [],
      isSystem: true,
      isActive: true,
    }])

    const deleted = await deletePersona('1', 'user-1')
    expect(deleted).toBe(false)
  })

  it('deletePersona returns true for user-owned persona', async () => {
    mocks.mockSelectWhere.mockResolvedValue([{
      id: '2',
      name: 'custom',
      description: '',
      scopeFilter: { include: [], exclude: [], boost: [] },
      systemPrompt: 'custom',
      defaultProvider: null,
      defaultModel: null,
      temperature: 0.7,
      maxTokens: 4096,
      allowedTools: [],
      isSystem: false,
      isActive: true,
    }])

    const deleted = await deletePersona('2', 'user-1')
    expect(deleted).toBe(true)
    expect(mocks.mockDeleteWhere).toHaveBeenCalledOnce()
  })
})
