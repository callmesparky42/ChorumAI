/**
 * Provider Fallback System
 * Handles automatic failover when providers are unavailable
 */

import type { ChatMessage, ChatResult, ProviderCallConfig, ToolDefinition } from './types'
import { callProvider, type FullProviderConfig } from './index'
import { getDefaultBaseUrl } from './index'

export interface FallbackConfig {
    /** Primary provider to try first */
    primary: FullProviderConfig
    /** Alternative providers to try on failure (in order) */
    alternatives: FullProviderConfig[]
    /** Local fallback providers (Ollama, LM Studio) - tried when cloud fails */
    localFallbacks: FullProviderConfig[]
    /** Maximum retries per provider before moving to next */
    maxRetriesPerProvider?: number
    /** Timeout for health checks (ms) */
    healthCheckTimeout?: number
    /** Tools available for all providers in the chain */
    tools?: ToolDefinition[]
    /** Tool choice setting */
    toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string }
}

export interface FallbackResult extends ChatResult {
    /** Which provider actually served the response */
    usedProvider: string
    /** Whether this was a fallback (not the primary) */
    wasFallback: boolean
    /** Failures encountered before success */
    failedProviders: { provider: string; error: string }[]
}

// Error types that should trigger fallback
const RETRIABLE_ERROR_PATTERNS = [
    /network/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /fetch failed/i,
    /rate limit/i,
    /429/,
    /500/,
    /502/,
    /503/,
    /504/,
    /overloaded/i,
    /capacity/i,
    /unavailable/i
]

// Errors that indicate auth issues - should NOT fallback, but report clearly
const AUTH_ERROR_PATTERNS = [
    /401/,
    /403/,
    /invalid.*key/i,
    /unauthorized/i,
    /authentication/i,
    /invalid.*api/i
]

/**
 * Determine if an error should trigger fallback to another provider
 */
function shouldFallback(error: Error): { shouldFallback: boolean; isAuthError: boolean } {
    const message = error.message

    // Check auth errors first - we want to flag these clearly
    const isAuthError = AUTH_ERROR_PATTERNS.some(pattern => pattern.test(message))
    if (isAuthError) {
        return { shouldFallback: true, isAuthError: true }
    }

    // Check retriable errors
    const isRetriable = RETRIABLE_ERROR_PATTERNS.some(pattern => pattern.test(message))
    return { shouldFallback: isRetriable, isAuthError: false }
}

/**
 * Quick health check for a provider endpoint
 * Returns true if the provider appears to be reachable
 */
export async function checkProviderHealth(
    provider: string,
    baseUrl?: string,
    timeout: number = 5000
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()

    try {
        // Different health check endpoints per provider
        const healthUrls: Record<string, string> = {
            anthropic: 'https://api.anthropic.com',
            openai: 'https://api.openai.com/v1/models',
            google: 'https://generativelanguage.googleapis.com',
            mistral: 'https://api.mistral.ai/v1/models',
            deepseek: 'https://api.deepseek.com',
            ollama: `${baseUrl || 'http://localhost:11434'}/api/tags`,
            lmstudio: `${baseUrl || 'http://localhost:1234'}/v1/models`,
        }

        const url = healthUrls[provider] || baseUrl
        if (!url) {
            return { healthy: false, latencyMs: 0, error: 'No health check URL available' }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal
        }).catch(() => fetch(url, { method: 'GET', signal: controller.signal }))

        clearTimeout(timeoutId)

        const latencyMs = Date.now() - start

        // For API endpoints, any response (even 401) means the service is up
        // 401/403 = reachable but auth issue, which is fine for health check
        if (response.ok || response.status === 401 || response.status === 403) {
            return { healthy: true, latencyMs }
        }

        return { healthy: false, latencyMs, error: `HTTP ${response.status}` }
    } catch (err: any) {
        const latencyMs = Date.now() - start

        if (err.name === 'AbortError') {
            return { healthy: false, latencyMs, error: 'Timeout' }
        }

        return { healthy: false, latencyMs, error: err.message }
    }
}

/**
 * Check if local providers (Ollama, LM Studio) are available
 */
export async function detectLocalProviders(): Promise<{
    ollama: { available: boolean; models: string[] }
    lmstudio: { available: boolean; models: string[] }
}> {
    const results = {
        ollama: { available: false, models: [] as string[] },
        lmstudio: { available: false, models: [] as string[] }
    }

    // Check Ollama
    try {
        const ollamaResponse = await fetch('http://localhost:11434/api/tags', {
            signal: AbortSignal.timeout(3000)
        })
        if (ollamaResponse.ok) {
            const data = await ollamaResponse.json()
            results.ollama.available = true
            results.ollama.models = data.models?.map((m: any) => m.name) || []
        }
    } catch {
        // Ollama not running
    }

    // Check LM Studio
    try {
        const lmstudioResponse = await fetch('http://localhost:1234/v1/models', {
            signal: AbortSignal.timeout(3000)
        })
        if (lmstudioResponse.ok) {
            const data = await lmstudioResponse.json()
            results.lmstudio.available = true
            results.lmstudio.models = data.data?.map((m: any) => m.id) || []
        }
    } catch {
        // LM Studio not running
    }

    return results
}

/**
 * Call a provider with automatic fallback to alternatives
 */
export async function callProviderWithFallback(
    config: FallbackConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<FallbackResult> {
    const maxRetries = config.maxRetriesPerProvider ?? 1
    const failedProviders: { provider: string; error: string }[] = []

    // Build the fallback chain: primary → alternatives → local fallbacks
    const providerChain: FullProviderConfig[] = [
        config.primary,
        ...config.alternatives,
        ...config.localFallbacks
    ]

    for (const providerConfig of providerChain) {
        let lastError: Error | null = null

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[Fallback] Trying ${providerConfig.provider} (attempt ${attempt + 1}/${maxRetries})`)

                // Merge tools from FallbackConfig into provider config
                const configWithTools = {
                    ...providerConfig,
                    tools: config.tools || providerConfig.tools,
                    toolChoice: config.toolChoice || providerConfig.toolChoice
                }

                const result = await callProvider(configWithTools, messages, systemPrompt)

                // Success!
                return {
                    ...result,
                    usedProvider: providerConfig.provider,
                    wasFallback: providerConfig !== config.primary,
                    failedProviders
                }
            } catch (err: any) {
                lastError = err
                console.warn(`[Fallback] ${providerConfig.provider} failed:`, err.message)

                const { shouldFallback: shouldTryNext, isAuthError } = shouldFallback(err)

                if (isAuthError) {
                    // Auth errors should be flagged clearly - don't retry same provider
                    failedProviders.push({
                        provider: providerConfig.provider,
                        error: `Authentication failed: ${err.message}`
                    })
                    break // Move to next provider
                }

                if (!shouldTryNext) {
                    // Non-retriable error (like invalid request) - still log but move on
                    failedProviders.push({
                        provider: providerConfig.provider,
                        error: err.message
                    })
                    break // Move to next provider
                }

                // Retriable error - might retry same provider
                if (attempt === maxRetries - 1) {
                    failedProviders.push({
                        provider: providerConfig.provider,
                        error: err.message
                    })
                }
            }
        }
    }

    // All providers failed
    const errorDetails = failedProviders
        .map(f => `${f.provider}: ${f.error}`)
        .join('; ')

    throw new Error(`All providers failed. ${errorDetails}`)
}

/**
 * Build fallback config from available provider configs
 * Intelligently orders providers: primary → cloud alternatives → local
 */
export function buildFallbackChain(
    providers: FullProviderConfig[],
    primaryProvider: string,
    localProviders?: { ollama?: string; lmstudio?: string }
): FallbackConfig {
    const primary = providers.find(p => p.provider === primaryProvider)
    if (!primary) {
        throw new Error(`Primary provider ${primaryProvider} not found in config`)
    }

    // Cloud providers as alternatives (excluding primary)
    const cloudProviders = ['anthropic', 'openai', 'google', 'mistral', 'deepseek']
    const alternatives = providers.filter(
        p => p.provider !== primaryProvider && cloudProviders.includes(p.provider)
    )

    // Build local fallbacks - inherit securitySettings from primary provider
    const localFallbacks: FullProviderConfig[] = []

    if (localProviders?.ollama) {
        localFallbacks.push({
            provider: 'ollama',
            apiKey: 'not-needed',
            model: localProviders.ollama,
            baseUrl: 'http://localhost:11434',
            isLocal: true,
            securitySettings: primary.securitySettings // Inherit security settings
        })
    }

    if (localProviders?.lmstudio) {
        localFallbacks.push({
            provider: 'lmstudio',
            apiKey: 'not-needed',
            model: localProviders.lmstudio,
            baseUrl: 'http://localhost:1234/v1',
            isLocal: true,
            securitySettings: primary.securitySettings // Inherit security settings
        })
    }

    return {
        primary,
        alternatives,
        localFallbacks,
        maxRetriesPerProvider: 1,
        healthCheckTimeout: 5000
    }
}

/**
 * Default fallback priority order
 * Used when user hasn't specified preferences
 */
export const DEFAULT_FALLBACK_ORDER = [
    'anthropic',  // Claude - most reliable, best quality
    'openai',     // GPT-4 - solid fallback
    'google',     // Gemini - good alternative
    'mistral',    // Mistral - decent fallback
    'deepseek',   // DeepSeek - cost-effective
    'ollama',     // Local - offline fallback
    'lmstudio'    // Local - offline fallback
]

/**
 * Sort providers by fallback priority
 */
export function sortByFallbackPriority(providers: FullProviderConfig[]): FullProviderConfig[] {
    return [...providers].sort((a, b) => {
        const indexA = DEFAULT_FALLBACK_ORDER.indexOf(a.provider)
        const indexB = DEFAULT_FALLBACK_ORDER.indexOf(b.provider)
        // Unknown providers go to the end
        const orderA = indexA === -1 ? 999 : indexA
        const orderB = indexB === -1 ? 999 : indexB
        return orderA - orderB
    })
}
