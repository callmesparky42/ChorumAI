/**
 * Provider Factory
 * Unified interface for calling any LLM provider
 */

import type { ChatMessage, ChatResult, ProviderCallConfig, SecuritySettings, ToolDefinition, ToolCall, ToolResult } from './types'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { callGoogle } from './google'
import { callMistral } from './mistral'
import { callDeepSeek } from './deepseek'
import { callOllama } from './ollama'
import { callOpenAICompatible } from './openai-compatible'

export type { ChatMessage, ChatResult, ProviderCallConfig, SecuritySettings, ToolDefinition, ToolCall, ToolResult }

export interface FullProviderConfig extends ProviderCallConfig {
    provider: string
}

/**
 * Default models for 'auto' mode per provider
 * These are the best general-purpose models for each provider
 */
const DEFAULT_MODELS: Record<string, string> = {
    anthropic: 'claude-sonnet-4-5-20250514',
    openai: 'gpt-5.2',
    google: 'gemini-2.5-flash',
    mistral: 'mistral-large-latest',
    deepseek: 'deepseek-chat',
    perplexity: 'llama-3.1-sonar-large-128k-online',
    xai: 'grok-2-latest',
    glm: 'glm-4-plus',
    ollama: 'phi3',
    lmstudio: 'local-model'
}

/**
 * Cheap models for background tasks (summarization, compilation, title generation)
 * These are optimized for cost rather than capability
 */
export const CHEAP_MODELS: Record<string, string> = {
    google: 'gemini-1.5-flash',          // $0.075/1M input - cheapest
    openai: 'gpt-4o-mini',               // $0.15/1M input
    deepseek: 'deepseek-chat',           // $0.14/1M input
    anthropic: 'claude-3-haiku-20240307', // $0.25/1M input
    mistral: 'mistral-small-latest'      // ~$0.20/1M input
}

/**
 * Provider preference order for background tasks (most cost-effective first)
 */
export const BACKGROUND_PROVIDER_PREFERENCE = ['google', 'openai', 'deepseek', 'anthropic', 'mistral']

/**
 * Get the cheap model for a provider (for background tasks)
 */
export function getCheapModel(provider: string): string {
    return CHEAP_MODELS[provider] || DEFAULT_MODELS[provider] || 'auto'
}

/**
 * Resolve 'auto' to the appropriate default model for a provider
 */
export function resolveModelForProvider(provider: string, model: string): string {
    if (model === 'auto') {
        return DEFAULT_MODELS[provider] || model
    }
    return model
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
    // Resolve 'auto' to the default model for this provider
    const resolvedModel = resolveModelForProvider(config.provider, config.model)

    const callConfig: ProviderCallConfig = {
        apiKey: config.apiKey,
        model: resolvedModel,
        baseUrl: config.baseUrl,
        isLocal: config.isLocal,
        securitySettings: config.securitySettings,
        tools: config.tools,
        toolChoice: config.toolChoice
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

/**
 * Generate an image using a supported provider
 */
import { callOpenAIImage } from './openai'

export async function generateImage(
    config: FullProviderConfig,
    prompt: string
): Promise<ChatResult> {
    switch (config.provider) {
        case 'openai':
            return callOpenAIImage(config, prompt)

        case 'google':
            // TODO: Implement Google Imagen integration
            // Fallback to text for now
            return {
                content: "Image generation with Google (Imagen) is not yet configured. Please switch to OpenAI for image generation.",
                tokensInput: 0,
                tokensOutput: 0
            }

        default:
            return {
                content: `Image generation is not supported for provider '${config.provider}'. Please use OpenAI.`,
                tokensInput: 0,
                tokensOutput: 0
            }
    }
}
