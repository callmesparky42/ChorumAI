import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/agents/personas', () => ({
  getPersonas: vi.fn(),
  getPersona: vi.fn(),
}))

vi.mock('@/lib/agents/provider-configs', () => ({
  getUserProviders: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getContextWindow: vi.fn(() => 128000),
  getCheapModel: vi.fn(() => 'cheap-model'),
  getDefaultModel: vi.fn(() => 'default-model'),
  normalizeProviderId: vi.fn((provider: string) => provider.toLowerCase() === 'claude' ? 'anthropic' : provider.toLowerCase()),
}))

import { getPersona, getPersonas } from '@/lib/agents/personas'
import { getUserProviders } from '@/lib/agents/provider-configs'
import { estimateComplexity, route } from '@/lib/agents/router'

describe('agents/router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("estimateComplexity('hello') returns trivial", () => {
    expect(estimateComplexity('hello')).toBe('trivial')
  })

  it("estimateComplexity('refactor the auth module') returns complex", () => {
    expect(estimateComplexity('refactor the auth module')).toBe('complex')
  })

  it('route with agentId returns specified persona', async () => {
    vi.mocked(getPersona).mockResolvedValue({
      id: 'a1',
      name: 'coder',
      description: '',
      scopeFilter: { include: ['#coding'], exclude: [], boost: [] },
      systemPromptTemplate: 'x',
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      temperature: 0.4,
      maxTokens: 4096,
      allowedTools: [],
      isSystem: true, tier: null,
    })
    vi.mocked(getUserProviders).mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-1',
        provider: 'openai',
        apiKey: 'key',
        modelOverride: null,
        baseUrl: null,
        isLocal: false,
        isEnabled: true,
        priority: 0,
      },
    ])

    const decision = await route('hello', 'user-1', 'a1')
    expect(decision.persona.id).toBe('a1')
  })

  it("route with coding scopes chooses 'coder' persona", async () => {
    vi.mocked(getPersona).mockResolvedValue(null)
    vi.mocked(getPersonas).mockResolvedValue([
      {
        id: 'd1',
        name: 'default',
        description: '',
        scopeFilter: { include: [], exclude: [], boost: [] },
        systemPromptTemplate: 'default',
        defaultProvider: null,
        defaultModel: null,
        temperature: 0.7,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: true, tier: null,
      },
      {
        id: 'c1',
        name: 'coder',
        description: '',
        scopeFilter: { include: ['#coding'], exclude: [], boost: [] },
        systemPromptTemplate: 'coder',
        defaultProvider: null,
        defaultModel: null,
        temperature: 0.5,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: true, tier: null,
      },
    ])
    vi.mocked(getUserProviders).mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-1',
        provider: 'openai',
        apiKey: 'key',
        modelOverride: null,
        baseUrl: null,
        isLocal: false,
        isEnabled: true,
        priority: 0,
      },
    ])

    const decision = await route('check function bug', 'user-1', undefined, {
      primary: 'coding',
      confidence: 0.8,
      detected: ['#coding'],
    })
    expect(decision.persona.name).toBe('coder')
  })

  it('route throws when no providers configured', async () => {
    vi.mocked(getPersona).mockResolvedValue(null)
    vi.mocked(getPersonas).mockResolvedValue([
      {
        id: 'd1',
        name: 'default',
        description: '',
        scopeFilter: { include: [], exclude: [], boost: [] },
        systemPromptTemplate: 'default',
        defaultProvider: null,
        defaultModel: null,
        temperature: 0.7,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: true, tier: null,
      },
    ])
    vi.mocked(getUserProviders).mockResolvedValue([])

    await expect(route('anything', 'user-1')).rejects.toThrow('No providers configured')
  })

  it('route normalizes persona defaultProvider aliases', async () => {
    vi.mocked(getPersona).mockResolvedValue({
      id: 'a1',
      name: 'writer',
      description: '',
      scopeFilter: { include: [], exclude: [], boost: [] },
      systemPromptTemplate: 'x',
      defaultProvider: 'Claude',
      defaultModel: null,
      temperature: 0.4,
      maxTokens: 4096,
      allowedTools: [],
      isSystem: true, tier: null,
    })
    vi.mocked(getUserProviders).mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-1',
        provider: 'anthropic',
        apiKey: 'key',
        modelOverride: null,
        baseUrl: null,
        isLocal: false,
        isEnabled: true,
        priority: 0,
      },
    ])

    const decision = await route('hello', 'user-1', 'a1')
    expect(decision.provider).toBe('anthropic')
  })
})
