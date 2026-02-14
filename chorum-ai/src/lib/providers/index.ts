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
import { anonymizePii } from '@/lib/pii'

export type { ChatMessage, ChatResult, ProviderCallConfig, SecuritySettings, ToolDefinition, ToolCall, ToolResult }

export interface FullProviderConfig extends ProviderCallConfig {
    provider: string
}

import {
    MODEL_REGISTRY,
    getCheapModel as getRegistryCheapModel,
    BACKGROUND_PROVIDER_PREFERENCE as REGISTRY_BACKGROUND_PREFERENCE,
    isProviderSupported as isRegistryProviderSupported,
    getDefaultModel,
    getContextWindow,
    getDefaultBaseUrl
} from './registry'

export { getDefaultModel, getContextWindow, getDefaultBaseUrl }

// ... existing code ...

/**
 * Cheap models for background tasks (summarization, compilation, title generation)
 * @deprecated Use registry.ts
 */
export const CHEAP_MODELS: Record<string, string> = {} // Kept temporarily if imported elsewhere, but empty implies deprecation

/**
 * Provider preference order for background tasks (most cost-effective first)
 */
export const BACKGROUND_PROVIDER_PREFERENCE = REGISTRY_BACKGROUND_PREFERENCE

/**
 * Get the cheap model for a provider (for background tasks)
 */
export function getCheapModel(provider: string): string {
    return getRegistryCheapModel(provider)
}

/**
 * Resolve 'auto' to the appropriate default model for a provider
 */
export function resolveModelForProvider(provider: string, model: string): string {
    if (model === 'auto') {
        return getDefaultModel(provider) || model
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

    // Apply PII anonymization if enabled
    let safeMessages = messages
    let safeSystemPrompt = systemPrompt

    if (config.securitySettings?.anonymizePii) {
        safeSystemPrompt = anonymizePii(systemPrompt).text

        safeMessages = messages.map(m => ({
            ...m,
            content: anonymizePii(m.content).text,
            toolResults: m.toolResults?.map(tr => ({
                ...tr,
                content: anonymizePii(tr.content).text
            }))
        }))
    }

    switch (config.provider) {
        case 'anthropic':
            return callAnthropic(callConfig, safeMessages, safeSystemPrompt)

        case 'openai':
            return callOpenAI(callConfig, safeMessages, safeSystemPrompt)

        case 'google':
            return callGoogle(callConfig, safeMessages, safeSystemPrompt)

        case 'mistral':
            return callMistral(callConfig, safeMessages, safeSystemPrompt)

        case 'deepseek':
            return callDeepSeek(callConfig, safeMessages, safeSystemPrompt)

        case 'perplexity':
            // Perplexity uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://api.perplexity.ai'
            }, safeMessages, safeSystemPrompt)

        case 'xai':
            // xAI (Grok) uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://api.x.ai/v1'
            }, safeMessages, safeSystemPrompt)

        case 'glm':
            // GLM-4 (Zhipu AI) uses OpenAI-compatible API
            return callOpenAICompatible({
                ...callConfig,
                baseUrl: callConfig.baseUrl || 'https://open.bigmodel.cn/api/paas/v4'
            }, safeMessages, safeSystemPrompt)

        case 'ollama':
            return callOllama(callConfig, safeMessages, safeSystemPrompt)

        case 'lmstudio':
            // LM Studio exposes OpenAI-compatible API
            return callOpenAICompatible(callConfig, safeMessages, safeSystemPrompt)

        case 'openai-compatible':
            return callOpenAICompatible(callConfig, safeMessages, safeSystemPrompt)

        default:
            // For any unknown provider, try OpenAI-compatible as fallback
            // This allows users to add custom providers that follow the OpenAI spec
            if (config.baseUrl) {
                console.log(`[Provider] Unknown provider "${config.provider}", trying OpenAI-compatible API`)
                return callOpenAICompatible(callConfig, safeMessages, safeSystemPrompt)
            }
            throw new Error(`Unsupported provider: ${config.provider}. Please provide a baseUrl for custom providers.`)
    }
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): boolean {
    return !!MODEL_REGISTRY[provider]
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
