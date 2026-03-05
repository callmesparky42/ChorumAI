import { describe, it, expect } from 'vitest'
import { selectTier, computeEffectiveBudget, estimateTokens } from '@/lib/core/podium/tiers'

// ---------------------------------------------------------------------------
// selectTier
// ---------------------------------------------------------------------------

describe('selectTier', () => {
  it('returns tier 1 for windows ≤ 16K (e.g. 8K)', () => {
    expect(selectTier(8_000)).toBe(1)
    expect(selectTier(16_000)).toBe(1)
  })

  it('returns tier 2 for windows in (16K, 64K] (e.g. 32K)', () => {
    expect(selectTier(16_001)).toBe(2)
    expect(selectTier(32_000)).toBe(2)
    expect(selectTier(64_000)).toBe(2)
  })

  it('returns tier 3 for windows > 64K (e.g. 128K)', () => {
    expect(selectTier(64_001)).toBe(3)
    expect(selectTier(128_000)).toBe(3)
    expect(selectTier(200_000)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// computeEffectiveBudget — budget clamping (the spec v1 bug)
// ---------------------------------------------------------------------------

describe('computeEffectiveBudget', () => {
  it('tier 1: 6% of window, capped at 960 tokens', () => {
    // 16000 * 0.06 = 960 — exactly at cap
    const { tier, effectiveBudget } = computeEffectiveBudget(16_000)
    expect(tier).toBe(1)
    expect(effectiveBudget).toBe(960)
  })

  it('tier 1: window smaller than cap — percentage applies', () => {
    // 8000 * 0.06 = 480 — below 960 cap
    const { tier, effectiveBudget } = computeEffectiveBudget(8_000)
    expect(tier).toBe(1)
    expect(effectiveBudget).toBe(480)
  })

  it('tier 2: 8% of window, capped at 5120 tokens', () => {
    // 64000 * 0.08 = 5120 — exactly at cap
    const { tier, effectiveBudget } = computeEffectiveBudget(64_000)
    expect(tier).toBe(2)
    expect(effectiveBudget).toBe(5_120)
  })

  it('tier 2: window smaller than cap — percentage applies', () => {
    // 32000 * 0.08 = 2560 — below 5120 cap
    const { tier, effectiveBudget } = computeEffectiveBudget(32_000)
    expect(tier).toBe(2)
    expect(effectiveBudget).toBe(2_560)
  })

  it('tier 3: 12% of window, capped at 12288 tokens', () => {
    // 102400 * 0.12 = 12288 — exactly at cap
    const { tier, effectiveBudget } = computeEffectiveBudget(102_400)
    expect(tier).toBe(3)
    expect(effectiveBudget).toBe(12_288)
  })

  it('tier 3: window smaller than cap — percentage applies', () => {
    // 65000 * 0.12 = 7800 — below 12288 cap
    const { tier, effectiveBudget } = computeEffectiveBudget(65_000)
    expect(tier).toBe(3)
    expect(effectiveBudget).toBe(7_800)
  })

  it('CRITICAL: large tier 3 window is clamped at 12288, not the full 12%', () => {
    // 200000 * 0.12 = 24000 — would exceed cap without clamping
    const { effectiveBudget } = computeEffectiveBudget(200_000)
    expect(effectiveBudget).toBe(12_288)
  })

  it('requestedBudget lower than calculated budget takes precedence', () => {
    // 16000 * 0.06 = 960, but caller requests only 500
    const { effectiveBudget } = computeEffectiveBudget(16_000, 500)
    expect(effectiveBudget).toBe(500)
  })

  it('requestedBudget higher than tier cap is still clamped at cap', () => {
    // Caller requests 2000, but tier 1 cap is 960
    const { effectiveBudget } = computeEffectiveBudget(16_000, 2_000)
    expect(effectiveBudget).toBe(960)
  })
})

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates 1 token per 4 chars (ceiling)', () => {
    expect(estimateTokens('abcd')).toBe(1)        // 4 chars = 1 token
    expect(estimateTokens('abcde')).toBe(2)        // 5 chars = 2 tokens (ceiling)
    expect(estimateTokens('a'.repeat(100))).toBe(25)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})
