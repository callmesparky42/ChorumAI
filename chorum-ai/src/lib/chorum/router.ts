import type { ChatMessage, ChatResult, ProviderCallConfig } from '../providers/types'
import { estimateTokens } from '../tokens'

export class BudgetExhaustedError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'BudgetExhaustedError'
    }
}

export type TaskType =
    | 'deep_reasoning'
    | 'code_generation'
    | 'bulk_processing'
    | 'structured_output'
    | 'vision_analysis'
    | 'image_generation'
    | 'general'

// Built-in cloud providers
export type CloudProvider = 'anthropic' | 'openai' | 'google' | 'mistral' | 'deepseek' | 'perplexity' | 'xai' | 'glm'
// Local/custom providers
export type LocalProvider = 'ollama' | 'lmstudio' | 'openai-compatible'
// Combined type - also allows custom string for fully custom providers
export type Provider = CloudProvider | LocalProvider | (string & {})

export interface ProviderConfig {
    provider: Provider
    model: string
    apiKey: string
    capabilities: string[]
    costPer1M: { input: number; output: number }
    dailyBudget: number
    spentToday: number
    baseUrl?: string      // Custom endpoint URL
    isLocal?: boolean     // Local vs cloud
    displayName?: string  // User-friendly name
}

export interface RoutingDecision {
    provider: Provider
    model: string
    reasoning: string
    estimatedCost: number
    alternatives: { provider: Provider; cost: number }[]
    taskType: TaskType
}

export class ChorumRouter {
    private providers: ProviderConfig[]

    constructor(providers: ProviderConfig[]) {
        this.providers = providers.filter(p => p.apiKey)
    }

    async route(opts: {
        prompt: string
        taskType?: TaskType
        estimatedTokens?: number
        userOverride?: Provider
        strategy?: string // 'control' | 'cost_optimized' | 'quality_optimized'
    }): Promise<RoutingDecision> {
        const taskType = opts.taskType || this.inferTaskType(opts.prompt)
        const estimatedTokens = opts.estimatedTokens || this.estimateTokens(opts.prompt)

        // If user manually selected provider, honor it
        if (opts.userOverride) {
            const provider = this.providers.find(p => p.provider === opts.userOverride)
            if (provider) {
                return {
                    provider: provider.provider,
                    model: provider.model,
                    reasoning: 'User override',
                    estimatedCost: this.calculateCost(provider, estimatedTokens),
                    alternatives: [],
                    taskType
                }
            }
        }

        // Filter providers by capability
        const capable = this.providers.filter(p =>
            this.hasCapability(p, taskType)
        )

        // Filter by budget
        const withinBudget = capable.filter(p =>
            p.spentToday < p.dailyBudget
        )

        if (withinBudget.length === 0) {
            // Throw specific error so caller can handle fallback (e.g. to local models)
            throw new BudgetExhaustedError('All cloud providers have exhausted daily budgets')
        }

        // Sort by cost (cheapest first for most tasks)
        const sorted = withinBudget.sort((a, b) => {
            const costA = this.calculateCost(a, estimatedTokens)
            const costB = this.calculateCost(b, estimatedTokens)

            // Quality ranking
            const qualityOrder: Record<string, number> = {
                anthropic: 0, openai: 1, google: 2, perplexity: 3, xai: 4, mistral: 5, deepseek: 6, glm: 7,
                ollama: 8, lmstudio: 8, 'openai-compatible': 8
            }

            // Strategy overrides
            if (opts.strategy === 'cost_optimized') {
                return costA - costB
            }

            if (opts.strategy === 'quality_optimized') {
                const orderA = qualityOrder[a.provider] ?? 6
                const orderB = qualityOrder[b.provider] ?? 6
                return orderA - orderB
            }

            // For deep reasoning, prefer quality over cost
            if (taskType === 'deep_reasoning') {
                const orderA = qualityOrder[a.provider] ?? 6
                const orderB = qualityOrder[b.provider] ?? 6
                return orderA - orderB
            }

            return costA - costB
        })

        const selected = sorted[0]
        const alternatives = sorted.slice(1, 3).map(p => ({
            provider: p.provider,
            cost: this.calculateCost(p, estimatedTokens)
        }))

        return {
            provider: selected.provider,
            model: selected.model,
            reasoning: this.buildReasoning(taskType, selected, alternatives),
            estimatedCost: this.calculateCost(selected, estimatedTokens),
            alternatives,
            taskType
        }
    }

    private inferTaskType(prompt: string): TaskType {
        const lower = prompt.toLowerCase()

        if (lower.match(/debug|fix|code|function|class|implement/)) {
            return 'code_generation'
        }
        if (lower.match(/analyze|research|explain|compare|evaluate/)) {
            return 'deep_reasoning'
        }
        if (lower.match(/json|table|list|format|structure/)) {
            return 'structured_output'
        }
        // Explicit "image of..." patterns at start of string
        if (lower.match(/^(image|picture|photo|drawing|sketch|painting) of/)) {
            return 'image_generation'
        }

        // Action verbs + noun
        if (lower.match(/(generate|create|make|draw|paint|render) (an? )?(image|picture|drawing|painting|illustration|sketch|art|photo)/)) {
            return 'image_generation'
        }

        if (lower.match(/image|screenshot|diagram|visual/)) {
            return 'vision_analysis'
        }

        return 'general'
    }

    private estimateTokens(prompt: string): number {
        // Use tiktoken for accurate estimation
        const inputTokens = estimateTokens(prompt)
        // Assume output represents a reasonable conversation turn, or could be parameterized
        // For strict cost control, we might want to be conservative
        return inputTokens + 500 // Assume 500 output tokens on average? Or just inputs. 
        // usage in calculateCost assumes tokens is TOTAL (input+output) split 50/50 in original code
        // let's stick to original returning a total, but make it more realistic.
        // Original: input * 2.
        // Let's do input + estimated_output.
        return inputTokens * 1.5
    }

    private calculateCost(provider: ProviderConfig, tokens: number): number {
        const inputTokens = tokens / 2
        const outputTokens = tokens / 2

        const inputCost = (inputTokens / 1_000_000) * provider.costPer1M.input
        const outputCost = (outputTokens / 1_000_000) * provider.costPer1M.output

        return inputCost + outputCost
    }

    private hasCapability(provider: ProviderConfig, task: TaskType): boolean {
        const taskMap: Record<TaskType, string[]> = {
            deep_reasoning: ['deep_reasoning', 'long_context'],
            code_generation: ['code_generation', 'structured_output'],
            bulk_processing: ['cost_efficient'],
            structured_output: ['structured_output', 'code_generation'],
            vision_analysis: ['vision'],
            image_generation: ['image_generation'],
            general: [] // All providers can handle general
        }

        const required = taskMap[task]

        // Special handling for image generation if capabilities aren't explicitly set in DB yet
        if (task === 'image_generation') {
            return provider.capabilities.includes('image_generation') || ['openai', 'google'].includes(provider.provider)
        }

        if (required.length === 0) return true

        return required.some(cap => provider.capabilities.includes(cap))
    }

    private buildReasoning(
        task: TaskType,
        selected: ProviderConfig,
        alternatives: { provider: Provider; cost: number }[]
    ): string {
        const reasons = []

        if (task === 'deep_reasoning') {
            reasons.push('Task requires deep reasoning')
        } else if (task === 'code_generation') {
            reasons.push('Task involves code generation')
        } else if (task === 'bulk_processing') {
            reasons.push('Bulk task, optimizing for cost')
        } else if (task === 'image_generation') {
            reasons.push('Image generation requested (routing into DALL-E/Imagen)')
        }

        if (selected.provider === 'anthropic') {
            reasons.push('Claude Opus selected for quality')
        } else if (selected.provider === 'google') {
            reasons.push('Gemini selected for cost efficiency')
        }

        const budgetRemaining = selected.dailyBudget - selected.spentToday
        if (budgetRemaining < selected.dailyBudget * 0.2) {
            reasons.push(`Low budget remaining ($${budgetRemaining.toFixed(2)})`)
        }

        return reasons.join(', ')
    }
}
