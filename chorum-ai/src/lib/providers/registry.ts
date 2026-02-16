export interface ModelEntry {
    id: string
    displayName: string
    provider: string
    tier: 'flagship' | 'standard' | 'fast' | 'legacy'
    contextWindow: number
    cost: { input: number; output: number }
    capabilities: ('reasoning' | 'code' | 'vision' | 'tools' | 'long_context' | 'general')[]
    released?: string
    deprecated?: boolean
}

export interface ProviderEntry {
    id: string
    name: string
    category: 'cloud' | 'local'
    requiresKey: boolean
    defaultBaseUrl?: string
    models: ModelEntry[]
    defaultModel: string
    cheapModel: string
    testModel: string
}

export const MODEL_REGISTRY: Record<string, ProviderEntry> = {
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        category: 'cloud',
        requiresKey: true,
        defaultModel: 'claude-3-5-sonnet-20240620', // Updated to current stable Sonnet 3.5
        cheapModel: 'claude-3-haiku-20240307',
        testModel: 'claude-3-haiku-20240307',
        models: [
            {
                id: 'claude-3-5-sonnet-20240620',
                displayName: 'Claude 3.5 Sonnet',
                provider: 'anthropic',
                tier: 'standard',
                contextWindow: 200000,
                cost: { input: 3, output: 15 },
                capabilities: ['code', 'vision', 'tools', 'general']
            },
            {
                id: 'claude-3-opus-20240229',
                displayName: 'Claude 3 Opus',
                provider: 'anthropic',
                tier: 'flagship',
                contextWindow: 200000,
                cost: { input: 15, output: 75 },
                capabilities: ['reasoning', 'code', 'vision', 'tools', 'general']
            },
            {
                id: 'claude-3-haiku-20240307',
                displayName: 'Claude 3 Haiku',
                provider: 'anthropic',
                tier: 'fast',
                contextWindow: 200000,
                cost: { input: 0.25, output: 1.25 },
                capabilities: ['code', 'tools', 'general']
            },
            {
                id: 'claude-sonnet-4-20250514', // From presets (illustrative/future?) - keeping for compatibility
                displayName: 'Claude Sonnet 4 (Preview)',
                provider: 'anthropic',
                tier: 'standard',
                contextWindow: 200000,
                cost: { input: 3, output: 15 },
                capabilities: ['code', 'vision', 'tools', 'general'],
                deprecated: true
            }
        ]
    },
    openai: {
        id: 'openai',
        name: 'OpenAI (GPT)',
        category: 'cloud',
        requiresKey: true,
        defaultModel: 'gpt-4o',
        cheapModel: 'gpt-4o-mini',
        testModel: 'gpt-4o-mini',
        models: [
            {
                id: 'gpt-4o',
                displayName: 'GPT-4o',
                provider: 'openai',
                tier: 'flagship',
                contextWindow: 128000,
                cost: { input: 2.50, output: 10 },
                capabilities: ['code', 'vision', 'tools', 'general']
            },
            {
                id: 'gpt-4o-mini',
                displayName: 'GPT-4o Mini',
                provider: 'openai',
                tier: 'fast',
                contextWindow: 128000,
                cost: { input: 0.15, output: 0.60 },
                capabilities: ['code', 'tools', 'general']
            },
            {
                id: 'gpt-4-turbo',
                displayName: 'GPT-4 Turbo',
                provider: 'openai',
                tier: 'flagship',
                contextWindow: 128000,
                cost: { input: 10, output: 30 },
                capabilities: ['code', 'vision', 'tools', 'general'],
                deprecated: true
            },
            {
                id: 'o1-preview',
                displayName: 'o1 Preview',
                provider: 'openai',
                tier: 'flagship',
                contextWindow: 128000,
                cost: { input: 15, output: 60 },
                capabilities: ['reasoning', 'general', 'code']
            },
            {
                id: 'o1-mini',
                displayName: 'o1 Mini',
                provider: 'openai',
                tier: 'standard',
                contextWindow: 128000,
                cost: { input: 3, output: 12 },
                capabilities: ['reasoning', 'code', 'general']
            }
        ]
    },
    google: {
        id: 'google',
        name: 'Google (Gemini)',
        category: 'cloud',
        requiresKey: true,
        defaultModel: 'gemini-2.0-flash',
        cheapModel: 'gemini-2.0-flash',
        testModel: 'gemini-2.0-flash',
        models: [
            {
                id: 'gemini-2.5-pro-preview-05-06',
                displayName: 'Gemini 2.5 Pro',
                provider: 'google',
                tier: 'flagship',
                contextWindow: 1000000,
                cost: { input: 1.25, output: 10 },
                capabilities: ['reasoning', 'long_context', 'vision', 'code', 'tools', 'general']
            },
            {
                id: 'gemini-2.5-flash-preview-05-20',
                displayName: 'Gemini 2.5 Flash',
                provider: 'google',
                tier: 'standard',
                contextWindow: 1000000,
                cost: { input: 0.15, output: 0.60 },
                capabilities: ['reasoning', 'long_context', 'vision', 'code', 'tools', 'general']
            },
            {
                id: 'gemini-2.0-flash',
                displayName: 'Gemini 2.0 Flash',
                provider: 'google',
                tier: 'fast',
                contextWindow: 1000000,
                cost: { input: 0.10, output: 0.40 },
                capabilities: ['long_context', 'vision', 'code', 'tools', 'general']
            },
            {
                id: 'gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                provider: 'google',
                tier: 'legacy',
                contextWindow: 1000000,
                cost: { input: 3.50, output: 10.50 },
                capabilities: ['long_context', 'vision', 'code', 'general'],
                deprecated: true
            }
        ]
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI',
        category: 'cloud',
        requiresKey: true,
        defaultBaseUrl: 'https://api.mistral.ai/v1',
        defaultModel: 'mistral-large-latest',
        cheapModel: 'mistral-small-latest',
        testModel: 'mistral-small-latest',
        models: [
            {
                id: 'mistral-large-latest',
                displayName: 'Mistral Large',
                provider: 'mistral',
                tier: 'flagship',
                contextWindow: 32000,
                cost: { input: 2, output: 6 },
                capabilities: ['code', 'general']
            },
            {
                id: 'mistral-small-latest',
                displayName: 'Mistral Small',
                provider: 'mistral',
                tier: 'fast',
                contextWindow: 32000,
                cost: { input: 0.2, output: 0.6 },
                capabilities: ['code', 'general']
            },
            {
                id: 'codestral-latest',
                displayName: 'Codestral',
                provider: 'mistral',
                tier: 'standard',
                contextWindow: 32000,
                cost: { input: 1, output: 3 },
                capabilities: ['code']
            }
        ]
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        category: 'cloud',
        requiresKey: true,
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        cheapModel: 'deepseek-chat',
        testModel: 'deepseek-chat',
        models: [
            {
                id: 'deepseek-chat',
                displayName: 'DeepSeek V3',
                provider: 'deepseek',
                tier: 'standard', // Beats GPT-4o often
                contextWindow: 64000,
                cost: { input: 0.14, output: 0.28 },
                capabilities: ['code', 'general', 'reasoning']
            },
            {
                id: 'deepseek-coder',
                displayName: 'DeepSeek Coder',
                provider: 'deepseek',
                tier: 'standard',
                contextWindow: 64000,
                cost: { input: 0.14, output: 0.28 },
                capabilities: ['code']
            }
        ]
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama (Local)',
        category: 'local',
        requiresKey: false,
        defaultBaseUrl: 'http://localhost:11434',
        defaultModel: 'llama3',
        cheapModel: 'llama3',
        testModel: 'llama3',
        models: [
            {
                id: 'llama3',
                displayName: 'Llama 3',
                provider: 'ollama',
                tier: 'standard',
                contextWindow: 8000,
                cost: { input: 0, output: 0 },
                capabilities: ['general', 'code']
            },
            {
                id: 'llama3:70b',
                displayName: 'Llama 3 70B',
                provider: 'ollama',
                tier: 'flagship',
                contextWindow: 8000,
                cost: { input: 0, output: 0 },
                capabilities: ['general', 'code']
            },
            {
                id: 'mistral',
                displayName: 'Mistral',
                provider: 'ollama',
                tier: 'fast',
                contextWindow: 8000,
                cost: { input: 0, output: 0 },
                capabilities: ['general']
            }
        ]
    },
    lmstudio: {
        id: 'lmstudio',
        name: 'LM Studio (Local)',
        category: 'local',
        requiresKey: false,
        defaultBaseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        cheapModel: 'local-model',
        testModel: 'local-model',
        models: [
            {
                id: 'local-model',
                displayName: 'Local Model',
                provider: 'lmstudio',
                tier: 'standard',
                contextWindow: 8000,
                cost: { input: 0, output: 0 },
                capabilities: ['general']
            }
        ]
    },
    'openai-compatible': {
        id: 'openai-compatible',
        name: 'OpenAI-Compatible API',
        category: 'local',
        requiresKey: false,
        defaultModel: 'custom',
        cheapModel: 'custom',
        testModel: 'custom',
        models: [
            {
                id: 'custom',
                displayName: 'Custom Model',
                provider: 'openai-compatible',
                tier: 'standard',
                contextWindow: 128000,
                cost: { input: 0, output: 0 },
                capabilities: ['general']
            }
        ]
    }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

export function getDefaultModel(provider: string): string {
    return MODEL_REGISTRY[provider]?.defaultModel || ''
}

export function getCheapModel(provider: string): string {
    return MODEL_REGISTRY[provider]?.cheapModel || MODEL_REGISTRY[provider]?.defaultModel || ''
}

export function getContextWindow(provider: string, modelId?: string): number {
    const p = MODEL_REGISTRY[provider]
    if (!p) return 128000

    if (modelId) {
        const m = p.models.find(m => m.id === modelId)
        if (m) return m.contextWindow
    }

    // Fallback to the context window of the default model if possible
    const defaultM = p.models.find(m => m.id === p.defaultModel)
    return defaultM?.contextWindow || 128000
}

export function getModelsForProvider(provider: string): ModelEntry[] {
    return MODEL_REGISTRY[provider]?.models || []
}

export function getTestModel(provider: string): string {
    return MODEL_REGISTRY[provider]?.testModel || ''
}

export function getModelDisplayName(provider: string, modelId: string): string {
    const p = MODEL_REGISTRY[provider]
    if (!p) return modelId
    const m = p.models.find(m => m.id === modelId)
    return m ? m.displayName : modelId
}

export function getProvider(provider: string): ProviderEntry | undefined {
    return MODEL_REGISTRY[provider]
}

export function getCloudProviders(): ProviderEntry[] {
    return Object.values(MODEL_REGISTRY).filter(p => p.category === 'cloud')
}

export function getLocalProviders(): ProviderEntry[] {
    return Object.values(MODEL_REGISTRY).filter(p => p.category === 'local')
}

// Global background provider preference order
// Spread background tasks across providers to avoid rate-limiting the chat provider.
// OpenAI gpt-4o-mini is cheap with generous rate limits — good default for background work.
export const BACKGROUND_PROVIDER_PREFERENCE = ['openai', 'anthropic', 'google', 'deepseek', 'mistral']

export function isProviderSupported(provider: string): boolean {
    return !!MODEL_REGISTRY[provider]
}

export function getDefaultBaseUrl(provider: string): string | undefined {
    return MODEL_REGISTRY[provider]?.defaultBaseUrl
}
