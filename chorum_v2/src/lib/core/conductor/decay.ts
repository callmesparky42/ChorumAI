// src/lib/core/conductor/decay.ts
// Decay formula — single source of truth.
// Called by the nightly decay cron tick, NOT by Podium at query time.
// Podium reads the already-decayed `confidence` column from the DB.

import type { LearningType } from '@/lib/nebula/types'

/** Types that decay and their half-lives in days. Undefined = no decay (immortal). */
export const HALF_LIFE_DAYS: Partial<Record<LearningType, number>> = {
    decision: 365,
    pattern: 90,
    voice: 90,
    plot_thread: 90,
    setting: 180,
    golden_path: 30,
    antipattern: 14,
    // invariant, anchor, character, world_rule → undefined = never decays
}

/** Minimum confidence value after decay. Items never fall below their floor. */
export const CONFIDENCE_FLOOR: Record<LearningType, number> = {
    invariant: 1.0,
    anchor: 1.0,
    character: 1.0,
    world_rule: 1.0,
    decision: 0.30,
    pattern: 0.15,
    voice: 0.15,
    plot_thread: 0.10,
    golden_path: 0.05,
    antipattern: 0.02,
    setting: 0.10,
}

export function computeDecayedConfidence(
    confidenceBase: number,
    type: LearningType,
    lastUsedAt: Date | null,
    createdAt: Date,
    pinnedAt: Date | null,
): number {
    if (pinnedAt) return confidenceBase                    // pinned = immortal

    const halfLife = HALF_LIFE_DAYS[type]
    if (halfLife === undefined) return confidenceBase      // invariant/anchor/etc = immortal

    const referenceDate = lastUsedAt ?? createdAt
    const ageDays = (Date.now() - referenceDate.getTime()) / 86_400_000
    const decayed = confidenceBase * Math.pow(0.5, ageDays / halfLife)
    const floor = CONFIDENCE_FLOOR[type] ?? 0.0

    return Math.max(decayed, floor)
}
