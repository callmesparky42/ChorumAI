// src/lib/core/conductor/confidence.ts
// Confidence_base calculation and explicit signal application.
// ONLY explicit signals are applied here. Heuristic/inaction signals are stored only.

import type { Learning } from '@/lib/nebula/types'
import { checkGuardrails, UNVERIFIED_CONFIDENCE_CAP } from './guardrails'

export const EXPLICIT_POSITIVE_DELTA = +0.15
export const EXPLICIT_NEGATIVE_DELTA = -0.2

/**
 * Calculate a new confidence_base value after an explicit positive or negative signal.
 */
export function applyExplicitSignal(
  learning: Learning,
  signal: 'positive' | 'negative',
  isVerified: boolean = false,
): { newBase: number; mustPropose: boolean } | null {
  const delta = signal === 'positive' ? EXPLICIT_POSITIVE_DELTA : EXPLICIT_NEGATIVE_DELTA

  const result = checkGuardrails({
    learning,
    proposedDelta: delta,
    isVerified,
    requiresApproval: false,
  })

  if (!result.allowed) return null

  const newBase = result.clampedBase ?? Math.max(0, Math.min(1, learning.confidenceBase + delta))
  return { newBase, mustPropose: result.mustCreateProposal }
}

/**
 * Full confidence_base formula.
 */
export function calculateConfidenceBase(
  interaction: number,
  verification: number,
  consistency: number,
  consistencyFactor: number,
  isVerified: boolean,
): number {
  const raw =
    interaction * 0.3 +
    verification * 0.4 +
    consistency * 0.2 +
    consistencyFactor * 0.1

  const ceiling = isVerified ? 1.0 : UNVERIFIED_CONFIDENCE_CAP
  return Math.max(0, Math.min(ceiling, raw))
}
