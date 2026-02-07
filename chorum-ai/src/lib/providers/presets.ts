/**
 * Provider Presets
 * Default configurations and model suggestions for each provider
 */

export interface ProviderPreset {
    name: string
    models: string[]
    defaultModel: string
    defaultCost: { input: number; output: number }
    capabilities: string[]
    requiresKey: boolean
    defaultBaseUrl?: string
    isLocal: boolean
    category: 'cloud' | 'local'
    contextWindow: number
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
    anthropic: {
        name: 'Anthropic (Claude)',
        models: [
            'claude-sonnet-4-20250514',
            'claude-3-5-sonnet-20240620',
            'claude-3-opus-20240229',
            'claude-3-haiku-20240307'
        ],
        defaultModel: 'claude-sonnet-4-20250514',
        defaultCost: { input: 3, output: 15 },
        capabilities: ['deep_reasoning', 'code_generation', 'general'],
        requiresKey: true,
        isLocal: false,
        category: 'cloud',
        contextWindow: 200000
    },
    openai: {
        name: 'OpenAI (GPT)',
        models: [
            'gpt-4o',
            'gpt-4-turbo',
            'gpt-4',
            'gpt-3.5-turbo',
            'o1-preview',
            'o1-mini'
        ],
        defaultModel: 'gpt-4o',
        defaultCost: { input: 10, output: 30 },
        capabilities: ['code_generation', 'structured_output', 'general'],
        requiresKey: true,
        isLocal: false,
        category: 'cloud',
        contextWindow: 128000
    },
    google: {
        name: 'Google (Gemini)',
        models: [
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-pro'
        ],
        defaultModel: 'gemini-1.5-pro',
        defaultCost: { input: 1.25, output: 5 },
        capabilities: ['cost_efficient', 'long_context', 'general'],
        requiresKey: true,
        isLocal: false,
        category: 'cloud',
        contextWindow: 1000000
    },
    mistral: {
        name: 'Mistral AI',
        models: [
            'mistral-large-latest',
            'mistral-medium-latest',
            'mistral-small-latest',
            'codestral-latest',
            'open-mistral-7b',
            'open-mixtral-8x7b'
        ],
        defaultModel: 'mistral-large-latest',
        defaultCost: { input: 2, output: 6 },
        capabilities: ['cost_efficient', 'code_generation', 'general'],
        requiresKey: true,
        defaultBaseUrl: 'https://api.mistral.ai/v1',
        isLocal: false,
        category: 'cloud',
        contextWindow: 32000
    },
    deepseek: {
        name: 'DeepSeek',
        models: [
            'deepseek-chat',
            'deepseek-coder'
        ],
        defaultModel: 'deepseek-chat',
        defaultCost: { input: 0.14, output: 0.28 },
        capabilities: ['code_generation', 'cost_efficient', 'general'],
        requiresKey: true,
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        isLocal: false,
        category: 'cloud',
        contextWindow: 64000
    },
    ollama: {
        name: 'Ollama (Local)',
        models: [
            'llama3',
            'llama3:70b',
            'mistral',
            'mixtral',
            'phi3',
            'phi3:medium',
            'codellama',
            'deepseek-coder',
            'gemma2',
            'qwen2'
        ],
        defaultModel: 'llama3',
        defaultCost: { input: 0, output: 0 },
        capabilities: ['general', 'code_generation'],
        requiresKey: false,
        defaultBaseUrl: 'http://localhost:11434',
        isLocal: true,
        category: 'local',
        contextWindow: 8000
    },
    lmstudio: {
        name: 'LM Studio (Local)',
        models: [
            'local-model' // User specifies their loaded model
        ],
        defaultModel: 'local-model',
        defaultCost: { input: 0, output: 0 },
        capabilities: ['general', 'code_generation'],
        requiresKey: false,
        defaultBaseUrl: 'http://localhost:1234/v1',
        isLocal: true,
        category: 'local',
        contextWindow: 8000
    },
    'openai-compatible': {
        name: 'OpenAI-Compatible API',
        models: [
            'custom' // User specifies
        ],
        defaultModel: 'custom',
        defaultCost: { input: 0, output: 0 },
        capabilities: ['general'],
        requiresKey: false, // Optional for most local servers
        isLocal: true,
        category: 'local',
        contextWindow: 128000
    }
}

/**
 * Get preset by provider name
 */
export function getPreset(provider: string): ProviderPreset | undefined {
    return PROVIDER_PRESETS[provider]
}

/**
 * Get all cloud providers
 */
export function getCloudProviders(): string[] {
    return Object.entries(PROVIDER_PRESETS)
        .filter(([_, preset]) => preset.category === 'cloud')
        .map(([key]) => key)
}

/**
 * Get all local providers
 */
export function getLocalProviders(): string[] {
    return Object.entries(PROVIDER_PRESETS)
        .filter(([_, preset]) => preset.category === 'local')
        .map(([key]) => key)
}

/**
 * Get all provider keys
 */
export function getAllProviders(): string[] {
    return Object.keys(PROVIDER_PRESETS)
}
