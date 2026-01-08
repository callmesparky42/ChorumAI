
import { createHash } from 'crypto'

export type ExperimentId = 'routing_strategy_v2' | 'prompt_opt_v1'

export interface ExperimentConfig {
    id: ExperimentId
    variants: string[]
    weights?: number[] // Defaults to equal split
    isActive: boolean
}

const experiments: Record<ExperimentId, ExperimentConfig> = {
    'routing_strategy_v2': {
        id: 'routing_strategy_v2',
        variants: ['control', 'cost_optimized', 'quality_optimized'],
        isActive: true
    },
    'prompt_opt_v1': {
        id: 'prompt_opt_v1',
        variants: ['control', 'test'],
        isActive: false
    }
}

export function getExperimentVariant(userId: string, experimentId: ExperimentId): string {
    const config = experiments[experimentId]
    if (!config || !config.isActive) {
        return 'control'
    }

    // Deterministic hashing for consistent assignment
    const hash = createHash('sha256').update(`${userId}:${experimentId}`).digest('hex')
    const intVal = parseInt(hash.substring(0, 8), 16)

    // Normalize to 0-1
    const normalized = intVal / 0xffffffff

    if (config.weights) {
        let cumulative = 0
        for (let i = 0; i < config.variants.length; i++) {
            cumulative += config.weights[i]
            if (normalized < cumulative) {
                return config.variants[i]
            }
        }
    } else {
        const index = Math.floor(normalized * config.variants.length)
        return config.variants[index]
    }

    return 'control'
}

export function getAllActiveExperiments(userId: string): Record<string, string> {
    const results: Record<string, string> = {}
    Object.values(experiments).forEach(exp => {
        if (exp.isActive) {
            results[exp.id] = getExperimentVariant(userId, exp.id as ExperimentId)
        }
    })
    return results
}
