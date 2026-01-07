/**
 * Provider Factory
 * Unified interface for calling any LLM provider
 */

import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { callGoogle } from './google'
import { callMistral } from './mistral'
import { callDeepSeek } from './deepseek'
import { callOllama } from './ollama'
import { callOpenAICompatible } from './openai-compatible'

export type { ChatMessage, ChatResult, ProviderCallConfig }

export interface FullProviderConfig extends ProviderCallConfig {
    provider: string
}

/**
 * Call any supported LLM provider
 * Routes to the appropriate implementation based on provider type
 */
export async function callProvider(
    config: FullProviderConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const callConfig: ProviderCallConfig = {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        isLocal: config.isLocal
    }

    switch (config.provider) {
        case 'anthropic':
            return callAnthropic(callConfig, messages, systemPrompt)

        case 'openai':
            return callOpenAI(callConfig, messages, systemPrompt)

        case 'google':
            return callGoogle(callConfig, messages, systemPrompt)

        case 'mistral':
            return callMistral(callConfig, messages, systemPrompt)

        case 'deepseek':
            return callDeepSeek(callConfig, messages, systemPrompt)

        case 'perplexity':
            // Perplexity uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://api.perplexity.ai'
            }, messages, systemPrompt)

        case 'xai':
            // xAI (Grok) uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://api.x.ai/v1'
            }, messages, systemPrompt)

        case 'glm':
            // GLM-4 (Zhipu AI) uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://open.bigmodel.cn/api/paas/v4'
            }, messages, systemPrompt)

        case 'ollama':
            return callOllama(callConfig, messages, systemPrompt)

        case 'lmstudio':
            // LM Studio exposes OpenAI-compatible API
            return callOpenAICompatible(callConfig, messages, systemPrompt)

        case 'openai-compatible':
            return callOpenAICompatible(callConfig, messages, systemPrompt)

        default:
            // For any unknown provider, try OpenAI-compatible as fallback
            // This allows users to add custom providers that follow the OpenAI spec
            if (config.baseUrl) {
                console.log(`[Provider] Unknown provider "${config.provider}", trying OpenAI-compatible API`)
                return callOpenAICompatible(callConfig, messages, systemPrompt)
            }
            throw new Error(`Unsupported provider: ${config.provider}. Please provide a baseUrl for custom providers.`)
    }
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): boolean {
    const supported = [
        'anthropic', 'openai', 'google', 'mistral', 'deepseek',
        'perplexity', 'xai', 'glm',
        'ollama', 'lmstudio', 'openai-compatible'
    ]
    return supported.includes(provider)
}

/**
 * Get the default base URL for a provider (if any)
 */
export function getDefaultBaseUrl(provider: string): string | undefined {
    const defaults: Record<string, string> = {
        ollama: 'http://localhost:11434',
        lmstudio: 'http://localhost:1234/v1',
        mistral: 'https://api.mistral.ai/v1',
        deepseek: 'https://api.deepseek.com/v1',
        perplexity: 'https://api.perplexity.ai',
        xai: 'https://api.x.ai/v1',
        glm: 'https://open.bigmodel.cn/api/paas/v4'
    }
    return defaults[provider]
}
