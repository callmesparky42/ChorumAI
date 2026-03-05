import { describe, it, expect } from 'vitest'
import {
  computeDecayedConfidence,
  HALF_LIFE_DAYS,
  CONFIDENCE_FLOOR,
} from '@/lib/core/conductor/decay'
import type { LearningType } from '@/lib/nebula/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

// ---------------------------------------------------------------------------
// Pinned items never decay
// ---------------------------------------------------------------------------

describe('computeDecayedConfidence — pinned items', () => {
  it('returns confidenceBase unchanged when pinnedAt is set', () => {
    const result = computeDecayedConfidence(0.9, 'antipattern', daysAgo(200), daysAgo(365), now)
    expect(result).toBe(0.9)
  })

  it('pinned overrides even types that would otherwise decay to floor', () => {
    const result = computeDecayedConfidence(0.8, 'golden_path', daysAgo(1000), daysAgo(1000), now)
    expect(result).toBe(0.8)
  })
})

// ---------------------------------------------------------------------------
// Immortal types never decay (no entry in HALF_LIFE_DAYS)
// ---------------------------------------------------------------------------

describe('computeDecayedConfidence — immortal types', () => {
  const immortalTypes: LearningType[] = ['invariant', 'anchor', 'character', 'world_rule']

  for (const type of immortalTypes) {
    it(`${type} returns confidenceBase unchanged after 365 days`, () => {
      expect(HALF_LIFE_DAYS[type]).toBeUndefined()
      const result = computeDecayedConfidence(0.85, type, daysAgo(365), daysAgo(400), null)
      expect(result).toBe(0.85)
    })
  }
})

// ---------------------------------------------------------------------------
// Decaying types follow half-life formula
// ---------------------------------------------------------------------------

describe('computeDecayedConfidence — half-life decay', () => {
  it('decision: at half-life (365 days) confidence is ~50% of base', () => {
    const base = 0.8
    const result = computeDecayedConfidence(base, 'decision', daysAgo(365), daysAgo(400), null)
    expect(result).toBeCloseTo(base * 0.5, 2)
  })

  it('pattern: at half-life (90 days) confidence is ~50% of base', () => {
    const base = 0.6
    const result = computeDecayedConfidence(base, 'pattern', daysAgo(90), daysAgo(120), null)
    expect(result).toBeCloseTo(base * 0.5, 2)
  })

  it('golden_path: at half-life (30 days) confidence is ~50% of base', () => {
    const base = 0.7
    const result = computeDecayedConfidence(base, 'golden_path', daysAgo(30), daysAgo(60), null)
    expect(result).toBeCloseTo(base * 0.5, 2)
  })

  it('antipattern: at half-life (14 days) confidence is ~50% of base', () => {
    const base = 0.5
    const result = computeDecayedConfidence(base, 'antipattern', daysAgo(14), daysAgo(30), null)
    expect(result).toBeCloseTo(base * 0.5, 2)
  })

  it('voice: at half-life (90 days) confidence is ~50% of base', () => {
    // voice half-life is 90 days — confirmed intentional in code vs spec drift
    expect(HALF_LIFE_DAYS['voice']).toBe(90)
    const base = 0.7
    const result = computeDecayedConfidence(base, 'voice', daysAgo(90), daysAgo(120), null)
    expect(result).toBeCloseTo(base * 0.5, 2)
  })

  it('uses lastUsedAt when present (preferred over createdAt)', () => {
    // same createdAt, different lastUsedAt → different decay
    const recentlyUsed = computeDecayedConfidence(0.8, 'pattern', daysAgo(10), daysAgo(200), null)
    const longUnused = computeDecayedConfidence(0.8, 'pattern', daysAgo(90), daysAgo(200), null)
    expect(recentlyUsed).toBeGreaterThan(longUnused)
  })

  it('falls back to createdAt when lastUsedAt is null', () => {
    const fromCreated = computeDecayedConfidence(0.8, 'pattern', null, daysAgo(90), null)
    expect(fromCreated).toBeCloseTo(0.8 * 0.5, 2)
  })
})

// ---------------------------------------------------------------------------
// Floor enforcement — items never fall below their floor
// ---------------------------------------------------------------------------

describe('computeDecayedConfidence — floor enforcement', () => {
  it('antipattern floor is 0.02 (very old item stays at floor)', () => {
    const floor = CONFIDENCE_FLOOR['antipattern']
    expect(floor).toBe(0.02)
    // 1000 days is >> 14-day half-life: decayed value would be ~0, floor kicks in
    const result = computeDecayedConfidence(0.5, 'antipattern', daysAgo(1000), daysAgo(1000), null)
    expect(result).toBeGreaterThanOrEqual(floor)
    expect(result).toBeCloseTo(floor, 3)
  })

  it('decision floor is 0.30 (old decisions stay useful)', () => {
    const floor = CONFIDENCE_FLOOR['decision']
    expect(floor).toBe(0.30)
    const result = computeDecayedConfidence(0.5, 'decision', daysAgo(5000), daysAgo(5000), null)
    expect(result).toBeGreaterThanOrEqual(floor)
    expect(result).toBeCloseTo(floor, 3)
  })

  it('pattern floor is 0.15', () => {
    const floor = CONFIDENCE_FLOOR['pattern']
    expect(floor).toBe(0.15)
    const result = computeDecayedConfidence(0.5, 'pattern', daysAgo(5000), daysAgo(5000), null)
    expect(result).toBeGreaterThanOrEqual(floor)
    expect(result).toBeCloseTo(floor, 3)
  })

  it('invariant floor is 1.0 (confidence never changes)', () => {
    expect(CONFIDENCE_FLOOR['invariant']).toBe(1.0)
  })
})
