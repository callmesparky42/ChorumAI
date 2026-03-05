import { describe, it, expect } from 'vitest'
import {
  computeRecencyScore,
  computeScopeMatchScore,
  getTypeWeight,
  scoreCandidate,
} from '@/lib/core/podium/scorer'
import type { ScoredLearning } from '@/lib/nebula'
import type { ScopeFilter } from '@/lib/nebula'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

function makeCandidate(overrides: Partial<ScoredLearning> = {}): ScoredLearning {
  return {
    id: 'test-id',
    userId: 'user-1',
    teamId: null,
    content: 'Use dependency injection for testability.',
    type: 'invariant',
    confidenceBase: 0.9,
    confidence: 0.85,
    extractionMethod: 'manual',
    sourceConversationId: null,
    refinedFrom: null,
    pinnedAt: null,
    mutedAt: null,
    usageCount: 3,
    lastUsedAt: daysAgo(5),
    promotedAt: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(5),
    score: 0,
    scopeMatchScore: 0,
    semanticScore: 0.8,
    ...overrides,
  }
}

const defaultScope: ScopeFilter = {
  include: ['project-abc'],
  exclude: [],
  boost: [],
}

// ---------------------------------------------------------------------------
// computeRecencyScore
// ---------------------------------------------------------------------------

describe('computeRecencyScore', () => {
  it('returns 1.0 for items used today', () => {
    const score = computeRecencyScore(now, daysAgo(30))
    expect(score).toBeCloseTo(1.0, 2)
  })

  it('returns ~0.5 for items used 30 days ago (one half-life)', () => {
    const score = computeRecencyScore(daysAgo(30), daysAgo(60))
    expect(score).toBeCloseTo(0.5, 2)
  })

  it('returns ~0.25 for items used 60 days ago (two half-lives)', () => {
    const score = computeRecencyScore(daysAgo(60), daysAgo(90))
    expect(score).toBeCloseTo(0.25, 2)
  })

  it('falls back to createdAt when lastUsedAt is null', () => {
    const score30 = computeRecencyScore(null, daysAgo(30))
    const score60 = computeRecencyScore(null, daysAgo(60))
    expect(score30).toBeGreaterThan(score60)
    expect(score30).toBeCloseTo(0.5, 2)
  })
})

// ---------------------------------------------------------------------------
// computeScopeMatchScore
// ---------------------------------------------------------------------------

describe('computeScopeMatchScore', () => {
  it('returns 0.6 when scope matches include (no boost)', () => {
    const score = computeScopeMatchScore(['project-abc'], {
      include: ['project-abc'],
      exclude: [],
      boost: [],
    })
    expect(score).toBeCloseTo(0.6, 5)
  })

  it('returns 1.0 when scope matches both include and boost', () => {
    const score = computeScopeMatchScore(['project-abc', 'lang-ts'], {
      include: ['project-abc'],
      exclude: [],
      boost: ['lang-ts'],
    })
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('returns 0 when include filter is non-empty and item does not match', () => {
    const score = computeScopeMatchScore(['unrelated'], {
      include: ['project-abc'],
      exclude: [],
      boost: [],
    })
    expect(score).toBe(0)
  })

  it('returns 0.6 when include filter is empty (no required scopes)', () => {
    const score = computeScopeMatchScore(['anything'], {
      include: [],
      exclude: [],
      boost: [],
    })
    expect(score).toBeCloseTo(0.6, 5)
  })
})

// ---------------------------------------------------------------------------
// getTypeWeight
// ---------------------------------------------------------------------------

describe('getTypeWeight', () => {
  it('returns 1.0 for invariant in coding domain', () => {
    expect(getTypeWeight('invariant', 'coding', 'question')).toBe(1.0)
  })

  it('returns 0.6 for antipattern in coding domain', () => {
    expect(getTypeWeight('antipattern', 'coding', 'question')).toBe(0.6)
  })

  it('returns 0.2 for unknown type in known domain', () => {
    expect(getTypeWeight('character', 'coding', 'question')).toBe(0.2)
  })

  it('returns 1.0 for all types when domain is null', () => {
    expect(getTypeWeight('invariant', null, 'question')).toBe(1.0)
    expect(getTypeWeight('antipattern', null, 'question')).toBe(1.0)
    expect(getTypeWeight('character', null, 'question')).toBe(1.0)
  })

  it('applies debugging boost: antipattern in coding domain × 2', () => {
    const base = getTypeWeight('antipattern', 'coding', 'question')  // 0.6
    const boosted = getTypeWeight('antipattern', 'coding', 'debugging')
    expect(boosted).toBeCloseTo(base * 2, 5)
  })

  it('applies debugging boost when domain is null', () => {
    const base = getTypeWeight('antipattern', null, 'question')   // 1.0
    const boosted = getTypeWeight('antipattern', null, 'debugging')
    expect(boosted).toBeCloseTo(base * 2, 5)
  })

  it('returns character = 1.0 in writing domain', () => {
    expect(getTypeWeight('character', 'writing', 'question')).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('produces a score in [0, 2] range (sum of weighted components, each ≤ 1)', () => {
    const candidate = makeCandidate({ semanticScore: 0.9, confidence: 0.8 })
    const result = scoreCandidate(candidate, 'question', 'coding', defaultScope, ['project-abc'])
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(2.0)
  })

  it('scores higher for recent items than stale ones (same everything else)', () => {
    const recent = makeCandidate({ lastUsedAt: daysAgo(1) })
    const stale = makeCandidate({ lastUsedAt: daysAgo(90) })
    const scoreRecent = scoreCandidate(recent, 'continuation', 'coding', defaultScope, ['project-abc']).score
    const scoreStale = scoreCandidate(stale, 'continuation', 'coding', defaultScope, ['project-abc']).score
    expect(scoreRecent).toBeGreaterThan(scoreStale)
  })

  it('scores higher with high semantic similarity', () => {
    const highSem = makeCandidate({ semanticScore: 0.95 })
    const lowSem = makeCandidate({ semanticScore: 0.1 })
    const hi = scoreCandidate(highSem, 'question', 'coding', defaultScope, ['project-abc']).score
    const lo = scoreCandidate(lowSem, 'question', 'coding', defaultScope, ['project-abc']).score
    expect(hi).toBeGreaterThan(lo)
  })

  it('returns a human-readable includeReason string', () => {
    const candidate = makeCandidate()
    const result = scoreCandidate(candidate, 'question', 'coding', defaultScope, ['project-abc'])
    expect(result.includeReason).toContain('score=')
    expect(result.includeReason).toContain('sem=')
    expect(result.includeReason).toContain('conf=')
  })

  it('uses analysis intent profile (higher semantic weight)', () => {
    const candidate = makeCandidate({ semanticScore: 0.9, confidence: 0.5 })
    const analysis = scoreCandidate(candidate, 'analysis', 'coding', defaultScope, ['project-abc']).score
    const greeting = scoreCandidate(candidate, 'greeting', 'coding', defaultScope, ['project-abc']).score
    // analysis weights semantic at 0.5, greeting at 0.2 — analysis should score higher
    expect(analysis).toBeGreaterThan(greeting)
  })
})
