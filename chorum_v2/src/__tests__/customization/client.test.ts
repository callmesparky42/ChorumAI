import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/customization/handlers', () => ({
  handleStartSession: vi.fn(),
  handleReadNebula: vi.fn(),
  handleGetContext: vi.fn(),
  handleInjectLearning: vi.fn(),
  handleSubmitFeedback: vi.fn(),
  handleExtractLearnings: vi.fn(),
  handleEndSession: vi.fn(),
}))

import {
  handleStartSession,
  handleGetContext,
  handleEndSession,
  handleExtractLearnings,
  handleInjectLearning,
  handleReadNebula,
  handleSubmitFeedback,
} from '@/lib/customization/handlers'
import { LocalChorumClient, MCPChorumClient } from '@/lib/customization/client'

const AUTH = {
  userId: '11111111-1111-4111-8111-111111111111',
  scopes: ['read:nebula', 'write:nebula', 'write:feedback'] as const,
}

describe('customization/client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('LocalChorumClient.readNebula matches handler output', async () => {
    vi.mocked(handleReadNebula).mockResolvedValue({
      learnings: [],
      total: 0,
    })

    const client = new LocalChorumClient({
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })
    const result = await client.readNebula({
      userId: AUTH.userId,
      scopes: ['project-a'],
      limit: 20,
      offset: 0,
    })

    expect(handleReadNebula).toHaveBeenCalledOnce()
    expect(result).toEqual({ learnings: [], total: 0 })
  })

  it('LocalChorumClient.startSession routes to handler', async () => {
    vi.mocked(handleStartSession).mockResolvedValue({
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      prefetchedContext: '',
      detectedScopes: ['#coding'],
      associatedProject: null,
      injectedItems: [],
    })

    const client = new LocalChorumClient({
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })
    const result = await client.startSession({
      userId: AUTH.userId,
      initialQuery: 'help me debug python function',
      contextWindowSize: 16000,
    })

    expect(result.detectedScopes).toContain('#coding')
    expect(handleStartSession).toHaveBeenCalledOnce()
  })

  it('MCPChorumClient sends JSON-RPC envelope with Bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 'rpc-1',
      result: { learnings: [], total: 0 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new MCPChorumClient('https://example.com/api/mcp', 'secret-token')
    const result = await client.readNebula({
      userId: AUTH.userId,
      scopes: ['project-a'],
      limit: 20,
      offset: 0,
    })

    expect(result).toEqual({ learnings: [], total: 0 })
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.com/api/mcp')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
    })

    const body = JSON.parse(init.body as string)
    expect(body.jsonrpc).toBe('2.0')
    expect(body.method).toBe('read_nebula')
    expect(body.params.userId).toBe(AUTH.userId)
  })

  it('keeps the full ChorumClient method surface wired', async () => {
    vi.mocked(handleGetContext).mockResolvedValue({
      compiledContext: 'ok',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 42,
    })
    vi.mocked(handleInjectLearning).mockResolvedValue({
      learning: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: AUTH.userId,
        teamId: null,
        content: 'x',
        type: 'invariant',
        confidenceBase: 0.5,
        confidence: 0.5,
        extractionMethod: 'manual',
        sourceConversationId: null,
        refinedFrom: null,
        pinnedAt: null,
        mutedAt: null,
        usageCount: 0,
        lastUsedAt: null,
        sourceApp: null,
        promotedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      proposalCreated: false,
      proposalId: null,
    })
    vi.mocked(handleSubmitFeedback).mockResolvedValue({ processed: true })
    vi.mocked(handleExtractLearnings).mockResolvedValue({
      extracted: [],
      totalExtracted: 0,
    })
    vi.mocked(handleEndSession).mockResolvedValue({
      extractedLearnings: 0,
      sessionDuration: 1,
      closed: true,
    })

    const client = new LocalChorumClient({
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    await client.getContext({
      userId: AUTH.userId,
      conversationId: '33333333-3333-4333-8333-333333333333',
      queryText: 'q',
      queryEmbedding: [0.1],
      scopeFilter: { include: [], exclude: [], boost: [] },
      intent: 'question',
      contextWindowSize: 16000,
    })
    await client.injectLearning({
      userId: AUTH.userId,
      content: 'x',
      type: 'invariant',
      scopes: ['project-a'],
      extractionMethod: 'manual',
    })
    await client.submitFeedback({
      userId: AUTH.userId,
      learningId: '55555555-5555-4555-8555-555555555555',
      signal: 'positive',
      source: 'explicit',
    })
    await client.extractLearnings({
      userId: AUTH.userId,
      conversationId: '33333333-3333-4333-8333-333333333333',
      conversationHistory: [],
    })
    await client.endSession({
      userId: AUTH.userId,
      conversationId: '33333333-3333-4333-8333-333333333333',
    })

    expect(handleGetContext).toHaveBeenCalledOnce()
    expect(handleInjectLearning).toHaveBeenCalledOnce()
    expect(handleSubmitFeedback).toHaveBeenCalledOnce()
    expect(handleExtractLearnings).toHaveBeenCalledOnce()
    expect(handleEndSession).toHaveBeenCalledOnce()
  })
})
