export type InjectionTier = 1 | 2 | 3

export interface TierConfig {
    tier: InjectionTier
    maxBudget: number       // Absolute token ceiling for this tier
    label: string           // For logging
}

export function selectInjectionTier(contextWindow: number): TierConfig {
    // Tier 1: Models with <= 16K context
    // Budget: min(500, contextWindow * 0.06)  — never exceed 6% of context
    if (contextWindow <= 16000) {
        return {
            tier: 1,
            maxBudget: Math.min(500, Math.floor(contextWindow * 0.06)),
            label: 'DNA Summary'
        }
    }

    // Tier 2: Models with 16K-64K context
    // Budget: min(2500, contextWindow * 0.08)  — up to 8% of context
    if (contextWindow <= 64000) {
        return {
            tier: 2,
            maxBudget: Math.min(2500, Math.floor(contextWindow * 0.08)),
            label: 'Field Guide'
        }
    }

    // Tier 3: Models with > 64K context
    // Budget: existing system (classifier-driven), capped at 10K
    return {
        tier: 3,
        maxBudget: 10000,
        label: 'Full Dossier'
    }
}
