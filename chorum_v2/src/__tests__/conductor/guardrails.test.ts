import { describe, it, expect } from 'vitest'
import {
  checkGuardrails,
  assertNoDelete,
  LARGE_DELTA_THRESHOLD,
  UNVERIFIED_CONFIDENCE_CAP,
} from '@/lib/core/conductor/guardrails'
import { NebulaError } from '@/lib/nebula/errors'
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
    content: 'Always use strict TypeScript.',
    type: 'invariant',
    confidenceBase: 0.5,
    confidence: 0.5,
    extractionMethod: 'manual',
    sourceConversationId: null,
    refinedFrom: null,
    pinnedAt: null,
    mutedAt: null,
    usageCount: 2,
    lastUsedAt: daysAgo(3),
    promotedAt: null,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(3),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// checkGuardrails — pinned invariant
// ---------------------------------------------------------------------------

describe('checkGuardrails — pinned items', () => {
  it('blocks all adjustments to pinned items (allowed: false)', () => {
    const learning = makeLearning({ pinnedAt: now })
    const result = checkGuardrails({
      learning,
      proposedDelta: 0.05,
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.mustCreateProposal).toBe(false)
    expect(result.violationReason).toMatch(/pinned/i)
  })

  it('blocks negative deltas on pinned items too', () => {
    const learning = makeLearning({ pinnedAt: now })
    const result = checkGuardrails({
      learning,
      proposedDelta: -0.3,
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkGuardrails — unverified confidence cap (0.7)
// ---------------------------------------------------------------------------

describe('checkGuardrails — unverified cap', () => {
  it('clamps confidence to 0.7 if unverified and delta would exceed cap', () => {
    // confidenceBase 0.6 + delta 0.2 = 0.8 — over cap
    const learning = makeLearning({ confidenceBase: 0.6 })
    const result = checkGuardrails({
      learning,
      proposedDelta: 0.2,
      isVerified: false,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.clampedBase).toBe(UNVERIFIED_CONFIDENCE_CAP)
  })

  it('does not clamp when unverified but delta keeps base under 0.7', () => {
    // confidenceBase 0.4 + delta 0.05 = 0.45 — under cap
    const learning = makeLearning({ confidenceBase: 0.4 })
    const result = checkGuardrails({
      learning,
      proposedDelta: 0.05,
      isVerified: false,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.clampedBase).toBeUndefined()
  })

  it('allows verified items to exceed 0.7', () => {
    const learning = makeLearning({ confidenceBase: 0.65 })
    const result = checkGuardrails({
      learning,
      proposedDelta: 0.2,
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.clampedBase).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// checkGuardrails — large delta requires proposal
// ---------------------------------------------------------------------------

describe('checkGuardrails — large delta threshold', () => {
  it('requires proposal when delta exceeds threshold (> 0.1)', () => {
    const learning = makeLearning({ confidenceBase: 0.5 })
    const result = checkGuardrails({
      learning,
      proposedDelta: LARGE_DELTA_THRESHOLD + 0.01,   // 0.11
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.mustCreateProposal).toBe(true)
  })

  it('does not require proposal for delta exactly at threshold (= 0.1)', () => {
    const learning = makeLearning({ confidenceBase: 0.5 })
    const result = checkGuardrails({
      learning,
      proposedDelta: LARGE_DELTA_THRESHOLD,   // 0.1 — not greater than, exactly equal
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.mustCreateProposal).toBe(false)
  })

  it('does not require proposal for small positive delta (< 0.1)', () => {
    const learning = makeLearning({ confidenceBase: 0.5 })
    const result = checkGuardrails({
      learning,
      proposedDelta: 0.05,
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.mustCreateProposal).toBe(false)
  })

  it('requires proposal for large negative delta (< -0.1)', () => {
    const learning = makeLearning({ confidenceBase: 0.5 })
    const result = checkGuardrails({
      learning,
      proposedDelta: -0.2,
      isVerified: true,
      requiresApproval: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.mustCreateProposal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// assertNoDelete
// ---------------------------------------------------------------------------

describe('assertNoDelete', () => {
  it('throws NebulaError when action is "delete"', () => {
    expect(() => assertNoDelete('delete')).toThrow(NebulaError)
  })

  it('does not throw for safe actions', () => {
    expect(() => assertNoDelete('archive')).not.toThrow()
    expect(() => assertNoDelete('update')).not.toThrow()
    expect(() => assertNoDelete('promote')).not.toThrow()
  })
})
