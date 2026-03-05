// src/lib/core/podium/tiers.ts
// Tiered context compilation. Budget clamping in ALL code paths — not optional.

export type Tier = 1 | 2 | 3

export interface TierConfig {
  tier: Tier
  budgetPct: number
  maxBudget: number
}

const TIER_CONFIGS: Record<Tier, Omit<TierConfig, 'tier'>> = {
  1: { budgetPct: 0.06, maxBudget: 960 },
  2: { budgetPct: 0.08, maxBudget: 5_120 },
  3: { budgetPct: 0.12, maxBudget: 12_288 },
}

export function selectTier(contextWindowSize: number): Tier {
  if (contextWindowSize <= 16_000) return 1
  if (contextWindowSize <= 64_000) return 2
  return 3
}

export function getTierConfig(tier: Tier): TierConfig {
  return { tier, ...TIER_CONFIGS[tier] }
}

/**
 * Compute the effective token budget for this request.
 *
 * CRITICAL: clamping is applied here and ONLY here.
 * Every code path — including cache miss fallback — must call this function.
 */
export function computeEffectiveBudget(
  contextWindowSize: number,
  requestedBudget?: number,
): { tier: Tier; effectiveBudget: number } {
  const tier = selectTier(contextWindowSize)
  const config = getTierConfig(tier)
  const fromWindow = Math.floor(contextWindowSize * config.budgetPct)
  const unclamped = requestedBudget !== undefined
    ? Math.min(requestedBudget, fromWindow)
    : fromWindow
  const effectiveBudget = Math.min(unclamped, config.maxBudget)
  return { tier, effectiveBudget }
}

/** Rough token estimator. 1 token ≈ 4 characters (good enough for budget management). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
