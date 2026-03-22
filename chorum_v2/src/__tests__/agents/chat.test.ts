import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/agents/router', () => ({
  route: vi.fn(),
}))

vi.mock('@/lib/core', () => ({
  createBinaryStar: vi.fn(),
}))

vi.mock('@/lib/nebula', () => ({
  createNebula: vi.fn(),
}))

vi.mock('@/lib/customization/scope-detection', () => ({
  detectScopes: vi.fn(),
}))

vi.mock('@/lib/customization/extraction', () => ({
  computeEmbedding: vi.fn(),
}))

vi.mock('@/lib/agents/provider-configs', () => ({
  getUserProviders: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  callProvider: vi.fn(),
  getDefaultModel: vi.fn((provider: string) => provider === 'google' ? 'gemini-2.0-flash' : 'gpt-4o'),
  normalizeProviderId: vi.fn((provider: string) => provider.toLowerCase() === 'gemini' ? 'google' : provider.toLowerCase()),
}))

import { route } from '@/lib/agents/router'
import { createBinaryStar } from '@/lib/core'
import { computeEmbedding } from '@/lib/customization/extraction'
import { detectScopes } from '@/lib/customization/scope-detection'
import { getUserProviders } from '@/lib/agents/provider-configs'
import { callProvider } from '@/lib/providers'
import { chat, chatSync } from '@/lib/agents/chat'

describe('agents/chat', () => {
  const binaryStar = {
    getContext: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createBinaryStar).mockReturnValue(binaryStar as never)
    vi.mocked(route).mockResolvedValue({
      persona: {
        id: 'default',
        name: 'default',
        description: '',
        scopeFilter: { include: [], exclude: [], boost: [] },
        systemPromptTemplate: 'System prompt {{context}}',
        defaultProvider: null,
        defaultModel: null,
        temperature: 0.7,
        maxTokens: 4096,
        allowedTools: [],
        isSystem: true, tier: null,
      },
      provider: 'openai',
      model: 'gpt-4o-mini',
      contextWindowSize: 16000,
      reason: 'test',
    })
    vi.mocked(detectScopes).mockResolvedValue(['#coding'])
    vi.mocked(computeEmbedding).mockResolvedValue([0.1, 0.2, 0.3])
    vi.mocked(getUserProviders).mockResolvedValue([
      {
        id: 'cfg-1',
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
    vi.mocked(callProvider).mockResolvedValue({
      content: 'assistant response',
      model: 'gpt-4o-mini',
      tokensInput: 10,
      tokensOutput: 20,
    })
  })

  it('chatSync returns response with required fields', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: 'Injected context',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 100,
      auditEntries: [],
    })

    const result = await chatSync({
      userId: 'user-1',
      conversationId: 'conv-1',
      message: 'hello',
      history: [],
      contextWindowSize: 16000,
    })

    expect(result.response).toBe('assistant response')
    expect(result.agentUsed.name).toBe('default')
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o-mini')
  })

  it('chatSync injects podium context', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: 'Known project rules',
      injectedItems: [{ id: 'l1', content: 'rule', type: 'invariant', confidence: 1, relevanceScore: 1, tokenCount: 2 }],
      tierUsed: 2,
      tokensUsed: 50,
      auditEntries: [],
    })

    const result = await chatSync({
      userId: 'user-1',
      conversationId: 'conv-2',
      message: 'what are our rules?',
      history: [],
      contextWindowSize: 16000,
    })

    expect(result.injectedContext).toContain('Known project rules')
  })

  it('chat yields at least one chunk', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: '',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 0,
      auditEntries: [],
    })

    const chunks: string[] = []
    for await (const chunk of chat({
      userId: 'user-1',
      conversationId: 'conv-3',
      message: 'stream',
      history: [],
      contextWindowSize: 16000,
    })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]).toBe('assistant response')
  })

  it('chatSync respects explicit provider selection and aliases', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: 'Injected context',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 100,
      auditEntries: [],
    })

    vi.mocked(getUserProviders).mockResolvedValue([
      {
        id: 'cfg-1',
        userId: 'user-1',
        provider: 'openai',
        apiKey: 'openai-key',
        modelOverride: null,
        baseUrl: null,
        isLocal: false,
        isEnabled: true,
        priority: 0,
      },
      {
        id: 'cfg-2',
        userId: 'user-1',
        provider: 'google',
        apiKey: 'google-key',
        modelOverride: null,
        baseUrl: null,
        isLocal: false,
        isEnabled: true,
        priority: 1,
      },
    ])

    await chatSync({
      userId: 'user-1',
      conversationId: 'conv-4',
      message: 'hello',
      selectedProvider: 'Gemini',
      history: [],
      contextWindowSize: 16000,
    })

    expect(callProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        model: 'gemini-2.0-flash',
        apiKey: 'google-key',
      }),
      expect.any(Array),
      expect.any(String),
    )
  })
})
