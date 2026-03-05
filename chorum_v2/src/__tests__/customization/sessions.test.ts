import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/nebula', () => ({
  createNebula: vi.fn(),
}))

vi.mock('@/lib/core', () => ({
  createBinaryStar: vi.fn(),
}))

vi.mock('@/lib/customization/scope-detection', () => ({
  detectScopes: vi.fn(),
}))

vi.mock('@/lib/customization/project-association', () => ({
  findProjectByScopes: vi.fn(),
}))

vi.mock('@/lib/customization/sessions', () => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  closeConversation: vi.fn(),
}))

vi.mock('@/lib/customization/extraction', () => ({
  extractLearningsFromHistory: vi.fn(),
  computeEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
}))

import { createBinaryStar } from '@/lib/core'
import { detectScopes } from '@/lib/customization/scope-detection'
import { findProjectByScopes } from '@/lib/customization/project-association'
import { closeConversation, createConversation } from '@/lib/customization/sessions'
import { extractLearningsFromHistory } from '@/lib/customization/extraction'
import { handleEndSession, handleStartSession } from '@/lib/customization/handlers'

const AUTH = {
  userId: '11111111-1111-4111-8111-111111111111',
  scopes: ['read:nebula', 'write:nebula', 'write:feedback'] as const,
}

describe('customization/session handlers', () => {
  const binaryStar = {
    getContext: vi.fn(),
    maybeFireSessionJudge: vi.fn().mockResolvedValue(undefined),
    submitSignal: vi.fn(),
    createProposal: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createBinaryStar).mockReturnValue(binaryStar as never)
    vi.mocked(createConversation).mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    vi.mocked(closeConversation).mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      startedAt: new Date(Date.now() - 5_000),
    } as never)
    vi.mocked(detectScopes).mockResolvedValue(['#coding'])
    vi.mocked(findProjectByScopes).mockResolvedValue(null)
    vi.mocked(extractLearningsFromHistory).mockResolvedValue([])
  })

  it('start_session with initialQuery returns prefetched context', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: 'memory context',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 12,
      auditEntries: [],
    })

    const result = await handleStartSession({
      userId: AUTH.userId,
      initialQuery: 'debug this python function',
      contextWindowSize: 16000,
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(result.prefetchedContext).toBe('memory context')
  })

  it('start_session carries explicit scope hints through', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: '',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 0,
      auditEntries: [],
    })

    const result = await handleStartSession({
      userId: AUTH.userId,
      scopeHints: ['#writing'],
      initialQuery: 'new draft',
      contextWindowSize: 16000,
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(result.detectedScopes).toContain('#writing')
  })

  it('start_session detects scopes from query text', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: '',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 0,
      auditEntries: [],
    })

    await handleStartSession({
      userId: AUTH.userId,
      initialQuery: 'python function has bug',
      contextWindowSize: 16000,
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(detectScopes).toHaveBeenCalled()
  })

  it('start_session auto-associates project when scope overlap exists', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: '',
      injectedItems: [],
      tierUsed: 1,
      tokensUsed: 0,
      auditEntries: [],
    })
    vi.mocked(findProjectByScopes).mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Project Alpha',
      scopeFilter: { include: ['#coding'], exclude: [], boost: [] },
      overlapScore: 1,
    })

    const result = await handleStartSession({
      userId: AUTH.userId,
      initialQuery: 'python function has bug',
      contextWindowSize: 16000,
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(result.associatedProject).toBe('Project Alpha')
  })

  it('end_session closes conversation record', async () => {
    const result = await handleEndSession({
      userId: AUTH.userId,
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(closeConversation).toHaveBeenCalledOnce()
    expect(result.closed).toBe(true)
  })

  it('end_session with history triggers extraction', async () => {
    vi.mocked(extractLearningsFromHistory).mockResolvedValue([
      {
        content: 'User prefers tabs',
        type: 'decision',
        scopes: ['#coding'],
        confidenceBase: 0.3,
        proposalCreated: true,
      },
    ] as never)

    const result = await handleEndSession({
      userId: AUTH.userId,
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      conversationHistory: [{ role: 'user', content: 'I prefer tabs' }],
    }, {
      userId: AUTH.userId,
      scopes: [...AUTH.scopes],
    })

    expect(result.extractedLearnings).toBeGreaterThan(0)
  })
})
