// src/lib/core/conductor/guardrails.ts
// Guardrails — inviolable rules enforced before any Conductor action.
// These are not configuration. Do not add bypass flags.

import type { Learning } from '@/lib/nebula/types'
import { NebulaError } from '@/lib/nebula'

export const LARGE_DELTA_THRESHOLD = 0.1
export const UNVERIFIED_CONFIDENCE_CAP = 0.7
export const PROMOTION_THRESHOLD = 0.85

export interface GuardrailContext {
  learning: Learning
  proposedDelta: number
  isVerified: boolean
  requiresApproval: boolean
}

export interface GuardrailResult {
  allowed: boolean
  mustCreateProposal: boolean
  violationReason?: string
  clampedBase?: number
}

/**
 * Check a proposed confidence_base change against all guardrails.
 */
export function checkGuardrails(ctx: GuardrailContext): GuardrailResult {
  const { learning, proposedDelta, isVerified } = ctx

  if (learning.pinnedAt !== null) {
    return {
      allowed: false,
      mustCreateProposal: false,
      violationReason: 'Learning is pinned — Conductor cannot adjust confidence',
    }
  }

  const newBase = learning.confidenceBase + proposedDelta

  if (!isVerified && newBase > UNVERIFIED_CONFIDENCE_CAP) {
    return {
      allowed: true,
      mustCreateProposal: Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD,
      clampedBase: UNVERIFIED_CONFIDENCE_CAP,
    }
  }

  if (newBase < 0 || newBase > 1.0) {
    return {
      allowed: true,
      mustCreateProposal: Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD,
      clampedBase: Math.max(0.0, Math.min(1.0, newBase)),
    }
  }

  if (Math.abs(proposedDelta) > LARGE_DELTA_THRESHOLD) {
    return { allowed: true, mustCreateProposal: true }
  }

  return { allowed: true, mustCreateProposal: false }
}

/**
 * Guard for deletion attempts. The Conductor cannot hard-delete.
 */
export function assertNoDelete(action: string): void {
  if (action === 'delete') {
    throw new NebulaError('INVALID_INPUT', 'Conductor cannot delete learnings — propose archive instead')
  }
}
