import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/nebula', () => ({
  createNebula: vi.fn(),
}))

vi.mock('@/lib/core', () => ({
  createBinaryStar: vi.fn(),
}))

import { createNebula } from '@/lib/nebula'
import { createBinaryStar } from '@/lib/core'
import type { AuthContext } from '@/lib/customization/types'
import type { Learning } from '@/lib/nebula/types'
import {
  handleGetContext,
  handleInjectLearning,
  handleReadNebula,
  handleSubmitFeedback,
} from '@/lib/customization/handlers'

const AUTH: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  scopes: ['read:nebula', 'write:nebula', 'write:feedback'],
}

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: AUTH.userId,
    teamId: null,
    content: 'Always write tests.',
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
    promotedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('customization/handlers', () => {
  const nebula = {
    getLearning: vi.fn(),
    getLearningsByScope: vi.fn(),
    createLearning: vi.fn(),
  }

  const binaryStar = {
    getContext: vi.fn(),
    submitSignal: vi.fn(),
    createProposal: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createNebula).mockReturnValue(nebula as never)
    vi.mocked(createBinaryStar).mockReturnValue(binaryStar as never)
  })

  it('handleReadNebula returns single learning when learningId is provided', async () => {
    const learning = makeLearning()
    nebula.getLearning.mockResolvedValue(learning)

    const result = await handleReadNebula({
      userId: AUTH.userId,
      learningId: learning.id,
      limit: 20,
      offset: 0,
    }, AUTH)

    expect(result.total).toBe(1)
    expect(result.learnings[0]?.id).toBe(learning.id)
  })

  it('handleReadNebula applies type filter and pagination', async () => {
    nebula.getLearningsByScope.mockResolvedValue([
      makeLearning({ id: 'a1111111-1111-4111-8111-111111111111', type: 'invariant' }),
      makeLearning({ id: 'b2222222-2222-4222-8222-222222222222', type: 'pattern' }),
      makeLearning({ id: 'c3333333-3333-4333-8333-333333333333', type: 'pattern' }),
    ])

    const result = await handleReadNebula({
      userId: AUTH.userId,
      scopes: ['project-a'],
      type: 'pattern',
      limit: 1,
      offset: 0,
    }, AUTH)

    expect(result.total).toBe(2)
    expect(result.learnings).toHaveLength(1)
    expect(result.learnings[0]?.type).toBe('pattern')
  })

  it('handleGetContext returns podium result shape', async () => {
    binaryStar.getContext.mockResolvedValue({
      compiledContext: 'compiled',
      injectedItems: [],
      tierUsed: 2,
      tokensUsed: 128,
      auditEntries: [],
    })

    const result = await handleGetContext({
      userId: AUTH.userId,
      conversationId: '33333333-3333-4333-8333-333333333333',
      queryText: 'How should I refactor this?',
      queryEmbedding: [0.1, 0.2],
      scopeFilter: { include: [], exclude: [], boost: [] },
      intent: 'question',
      contextWindowSize: 16_000,
    }, AUTH)

    expect(result.compiledContext).toBe('compiled')
    expect(result.tierUsed).toBe(2)
    expect(result.tokensUsed).toBe(128)
  })

  it('handleInjectLearning manual writes directly with no proposal', async () => {
    const created = makeLearning()
    nebula.createLearning.mockResolvedValue(created)

    const result = await handleInjectLearning({
      userId: AUTH.userId,
      content: created.content,
      type: created.type,
      scopes: ['project-a'],
      extractionMethod: 'manual',
    }, AUTH)

    expect(nebula.createLearning).toHaveBeenCalledWith(expect.objectContaining({
      confidenceBase: 0.5,
      extractionMethod: 'manual',
    }))
    expect(binaryStar.createProposal).not.toHaveBeenCalled()
    expect(result.proposalCreated).toBe(false)
    expect(result.proposalId).toBeNull()
  })

  it('handleInjectLearning auto creates low-confidence learning and proposal', async () => {
    const created = makeLearning({ extractionMethod: 'auto' })
    nebula.createLearning.mockResolvedValue(created)
    binaryStar.createProposal.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
    })

    const result = await handleInjectLearning({
      userId: AUTH.userId,
      content: 'Auto extracted note',
      type: 'pattern',
      scopes: ['project-a'],
      extractionMethod: 'auto',
    }, AUTH)

    expect(nebula.createLearning).toHaveBeenCalledWith(expect.objectContaining({
      confidenceBase: 0.3,
      extractionMethod: 'auto',
    }))
    expect(binaryStar.createProposal).toHaveBeenCalledOnce()
    expect(result.proposalCreated).toBe(true)
    expect(result.proposalId).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('handleSubmitFeedback forwards signal to submitSignal', async () => {
    binaryStar.submitSignal.mockResolvedValue(undefined)

    const result = await handleSubmitFeedback({
      userId: AUTH.userId,
      learningId: '55555555-5555-4555-8555-555555555555',
      signal: 'positive',
      source: 'explicit',
    }, AUTH)

    expect(binaryStar.submitSignal).toHaveBeenCalledOnce()
    expect(result).toEqual({ processed: true })
  })
})
