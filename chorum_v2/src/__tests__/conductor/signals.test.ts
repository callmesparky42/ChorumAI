// vi.mock calls are hoisted to the top of the file by Vitest.
// They prevent @/db from being evaluated (no postgres connection needed).
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock @/db and @/db/schema to prevent DB connection attempts during module load
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/db/schema', () => ({}))

// Mock proposals module — createProposal writes to DB; we test routing, not DB writes
vi.mock('@/lib/core/conductor/proposals', () => ({
  createProposal: vi.fn().mockResolvedValue(undefined),
}))

import { SignalProcessor } from '@/lib/core/conductor/signals'
import { createProposal } from '@/lib/core/conductor/proposals'
import type { NebulaInterface } from '@/lib/nebula'
import type { ConductorSignal } from '@/lib/core/interface'
import type { Learning } from '@/lib/nebula/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

function makeLearning(overrides: Partial<Learning> = {}): Learning {
  return {
    id: 'learning-1',
    userId: 'user-1',
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
    usageCount: 1,
    lastUsedAt: daysAgo(1),
    sourceApp: null,
    promotedAt: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    ...overrides,
  }
}

function makeSignal(overrides: Partial<ConductorSignal> = {}): ConductorSignal {
  return {
    type: 'explicit',
    learningId: 'learning-1',
    conversationId: 'conv-1',
    injectionId: 'inject-1',
    signal: 'positive',
    source: 'user',
    timestamp: now,
    ...overrides,
  }
}

function makeMockNebula(learning: Learning): NebulaInterface {
  return {
    getLearning: vi.fn().mockResolvedValue(learning),
    recordFeedback: vi.fn().mockResolvedValue(undefined),
    updateLearning: vi.fn().mockResolvedValue({ ...learning }),
    // Remaining methods are not called in signal processing — stubs suffice
    createLearning: vi.fn(),
    deleteLearning: vi.fn(),
    getLearningsByScope: vi.fn(),
    searchByEmbedding: vi.fn(),
    setEmbedding: vi.fn(),
    hasEmbedding: vi.fn(),
    getLearningsWithoutEmbedding: vi.fn(),
    createLink: vi.fn(),
    getLinksFor: vi.fn(),
    recordCooccurrence: vi.fn(),
    getCohort: vi.fn(),
    getPendingFeedback: vi.fn(),
    markFeedbackProcessed: vi.fn(),
    logInjectionAudit: vi.fn(),
    validateApiToken: vi.fn(),
    createApiToken: vi.fn(),
    revokeApiToken: vi.fn(),
    incrementUsageCount: vi.fn(),
  } as unknown as NebulaInterface
}

// ---------------------------------------------------------------------------
// v2.0 Signal Policy: heuristic / inaction signals → stored only
// ---------------------------------------------------------------------------

describe('SignalProcessor — v2.0 store-only policy', () => {
  let learning: Learning
  let nebula: NebulaInterface
  let processor: SignalProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    learning = makeLearning()
    nebula = makeMockNebula(learning)
    processor = new SignalProcessor(nebula)
  })

  it('POLICY: heuristic signal stores feedback but does NOT call updateLearning', async () => {
    const signal = makeSignal({ type: 'heuristic', signal: 'positive' })
    await processor.process(signal)

    expect(nebula.recordFeedback).toHaveBeenCalledOnce()
    // v2.0 invariant: heuristic signals never mutate confidence_base
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })

  it('POLICY: inaction signal stores feedback but does NOT call updateLearning', async () => {
    const signal = makeSignal({ type: 'inaction', signal: 'none' })
    await processor.process(signal)

    expect(nebula.recordFeedback).toHaveBeenCalledOnce()
    // v2.0 invariant: inaction signals never mutate confidence_base
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })

  it('POLICY: end_of_session_judge always creates a proposal, never calls updateLearning', async () => {
    const signal = makeSignal({ type: 'end_of_session_judge', signal: 'positive' })
    await processor.process(signal)

    expect(nebula.recordFeedback).toHaveBeenCalledOnce()
    expect(nebula.updateLearning).not.toHaveBeenCalled()
    expect(createProposal).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Explicit signals — applied immediately
// ---------------------------------------------------------------------------

describe('SignalProcessor — explicit signals', () => {
  let learning: Learning
  let nebula: NebulaInterface
  let processor: SignalProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    learning = makeLearning({ confidenceBase: 0.5 })
    nebula = makeMockNebula(learning)
    processor = new SignalProcessor(nebula)
  })

  it('positive explicit signal creates a proposal (delta +0.15 exceeds large-delta threshold 0.10)', async () => {
    // EXPLICIT_POSITIVE_DELTA = +0.15 > LARGE_DELTA_THRESHOLD (0.10)
    // → checkGuardrails returns mustCreateProposal: true → routes to createProposal, not updateLearning
    const signal = makeSignal({ type: 'explicit', signal: 'positive' })
    await processor.process(signal)

    expect(nebula.recordFeedback).toHaveBeenCalledOnce()
    expect(createProposal).toHaveBeenCalledOnce()
    // "applied immediately" means no inaction timeout — NOT that the delta check is bypassed
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })

  it('negative explicit signal creates a proposal (delta -0.20 exceeds large-delta threshold 0.10)', async () => {
    // EXPLICIT_NEGATIVE_DELTA = -0.20, abs(-0.20) > LARGE_DELTA_THRESHOLD (0.10) → proposal
    const signal = makeSignal({ type: 'explicit', signal: 'negative' })
    await processor.process(signal)

    expect(nebula.recordFeedback).toHaveBeenCalledOnce()
    expect(createProposal).toHaveBeenCalledOnce()
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })

  it('explicit signal on pinned item does NOT call updateLearning (guardrail)', async () => {
    const pinnedLearning = makeLearning({ confidenceBase: 0.8, pinnedAt: now })
    nebula = makeMockNebula(pinnedLearning)
    processor = new SignalProcessor(nebula)

    const signal = makeSignal({ type: 'explicit', signal: 'positive' })
    await processor.process(signal)

    // Pinned items: checkGuardrails returns allowed=false → applyExplicitSignal returns null → no update
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })

  it('explicit positive on high unverified item creates proposal instead of direct update', async () => {
    // confidenceBase 0.65 + 0.15 = 0.80 — would exceed 0.7 cap AND delta > threshold
    const highUnverified = makeLearning({ confidenceBase: 0.65 })
    nebula = makeMockNebula(highUnverified)
    processor = new SignalProcessor(nebula)

    const signal = makeSignal({ type: 'explicit', signal: 'positive' })
    await processor.process(signal)

    // delta is 0.15 > LARGE_DELTA_THRESHOLD (0.10) → must create proposal
    expect(createProposal).toHaveBeenCalledOnce()
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('SignalProcessor — edge cases', () => {
  it('returns early without error when learning is not found', async () => {
    const nebula = makeMockNebula(makeLearning())
      ; (nebula.getLearning as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const processor = new SignalProcessor(nebula)

    const signal = makeSignal({ type: 'explicit', signal: 'positive' })
    await expect(processor.process(signal)).resolves.not.toThrow()
    expect(nebula.recordFeedback).not.toHaveBeenCalled()
    expect(nebula.updateLearning).not.toHaveBeenCalled()
  })
})
