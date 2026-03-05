import type { ChatMessage, ChatResult, ToolDefinition } from './types'
import { callProvider, type FullProviderConfig } from './index'

export interface FallbackConfig {
  primary: FullProviderConfig
  alternatives: FullProviderConfig[]
  localFallbacks: FullProviderConfig[]
  maxRetriesPerProvider?: number
  healthCheckTimeout?: number
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string }
}

export interface FallbackResult extends ChatResult {
  usedProvider: string
  wasFallback: boolean
  failedProviders: Array<{ provider: string; error: string }>
}

const RETRIABLE_ERROR_PATTERNS = [
  /network/i,
  /timeout/i,
  /econnrefused/i,
  /enotfound/i,
  /fetch failed/i,
  /rate limit/i,
  /429/,
  /500/,
  /502/,
  /503/,
  /504/,
  /overloaded/i,
  /capacity/i,
  /unavailable/i,
]

const AUTH_ERROR_PATTERNS = [
  /401/,
  /403/,
  /invalid.*key/i,
  /unauthorized/i,
  /authentication/i,
  /invalid.*api/i,
]

function shouldFallback(error: Error): { shouldFallback: boolean; isAuthError: boolean } {
  const message = error.message
  const isAuthError = AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  if (isAuthError) {
    return { shouldFallback: true, isAuthError: true }
  }
  const isRetriable = RETRIABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  return { shouldFallback: isRetriable, isAuthError: false }
}

export async function checkProviderHealth(
  provider: string,
  baseUrl?: string,
  timeout: number = 5000,
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()

  try {
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
    if (!url) return { healthy: false, latencyMs: 0, error: 'No health check URL available' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, { method: 'HEAD', signal: controller.signal })
      .catch(() => fetch(url, { method: 'GET', signal: controller.signal }))
    clearTimeout(timer)

    const latencyMs = Date.now() - start
    if (response.ok || response.status === 401 || response.status === 403) {
      return { healthy: true, latencyMs }
    }

    return { healthy: false, latencyMs, error: `HTTP ${response.status}` }
  } catch (error) {
    const latencyMs = Date.now() - start
    if (error instanceof Error && error.name === 'AbortError') {
      return { healthy: false, latencyMs, error: 'Timeout' }
    }
    return {
      healthy: false,
      latencyMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

interface ModelListResponse {
  models?: Array<{ name?: string }>
  data?: Array<{ id?: string }>
}

export async function detectLocalProviders(): Promise<{
  ollama: { available: boolean; models: string[] }
  lmstudio: { available: boolean; models: string[] }
}> {
  const results = {
    ollama: { available: false, models: [] as string[] },
    lmstudio: { available: false, models: [] as string[] },
  }

  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    })
    if (response.ok) {
      const data = (await response.json()) as ModelListResponse
      results.ollama.available = true
      results.ollama.models = (data.models ?? [])
        .map((model) => model.name)
        .filter((name): name is string => typeof name === 'string')
    }
  } catch {
    // Local endpoint unavailable.
  }

  try {
    const response = await fetch('http://localhost:1234/v1/models', {
      signal: AbortSignal.timeout(3000),
    })
    if (response.ok) {
      const data = (await response.json()) as ModelListResponse
      results.lmstudio.available = true
      results.lmstudio.models = (data.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => typeof id === 'string')
    }
  } catch {
    // Local endpoint unavailable.
  }

  return results
}

export async function callProviderWithFallback(
  config: FallbackConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<FallbackResult> {
  const maxRetries = config.maxRetriesPerProvider ?? 1
  const failedProviders: Array<{ provider: string; error: string }> = []
  const chain: FullProviderConfig[] = [
    config.primary,
    ...config.alternatives,
    ...config.localFallbacks,
  ]

  for (const providerConfig of chain) {
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const tools = config.tools ?? providerConfig.tools
        const toolChoice = config.toolChoice ?? providerConfig.toolChoice
        const mergedConfig: FullProviderConfig = {
          ...providerConfig,
          ...(tools !== undefined ? { tools } : {}),
          ...(toolChoice !== undefined ? { toolChoice } : {}),
        }

        const result = await callProvider(mergedConfig, messages, systemPrompt)
        return {
          ...result,
          usedProvider: providerConfig.provider,
          wasFallback: providerConfig.provider !== config.primary.provider,
          failedProviders,
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown provider error')
        const decision = shouldFallback(err)
        if (decision.isAuthError || !decision.shouldFallback || attempt === maxRetries - 1) {
          failedProviders.push({ provider: providerConfig.provider, error: err.message })
          break
        }
      }
    }
  }

  const details = failedProviders.map((failure) => `${failure.provider}: ${failure.error}`).join('; ')
  throw new Error(`All providers failed. ${details}`)
}

export function buildFallbackChain(
  providers: FullProviderConfig[],
  primaryProvider: string,
  localProviders?: { ollama?: string; lmstudio?: string },
): FallbackConfig {
  const primary = providers.find((provider) => provider.provider === primaryProvider)
  if (!primary) {
    throw new Error(`Primary provider ${primaryProvider} not found in config`)
  }

  const cloudProviders = ['anthropic', 'openai', 'google', 'mistral', 'deepseek']
  const alternatives = providers.filter(
    (provider) => provider.provider !== primaryProvider && cloudProviders.includes(provider.provider),
  )

  const localFallbacks: FullProviderConfig[] = []
  if (localProviders?.ollama) {
    localFallbacks.push({
      provider: 'ollama',
      apiKey: 'not-needed',
      model: localProviders.ollama,
      baseUrl: 'http://localhost:11434',
      isLocal: true,
      ...(primary.securitySettings !== undefined
        ? { securitySettings: primary.securitySettings }
        : {}),
    })
  }
  if (localProviders?.lmstudio) {
    localFallbacks.push({
      provider: 'lmstudio',
      apiKey: 'not-needed',
      model: localProviders.lmstudio,
      baseUrl: 'http://localhost:1234/v1',
      isLocal: true,
      ...(primary.securitySettings !== undefined
        ? { securitySettings: primary.securitySettings }
        : {}),
    })
  }

  return {
    primary,
    alternatives,
    localFallbacks,
    maxRetriesPerProvider: 1,
    healthCheckTimeout: 5000,
  }
}

export const DEFAULT_FALLBACK_ORDER = [
  'anthropic',
  'openai',
  'google',
  'mistral',
  'deepseek',
  'ollama',
  'lmstudio',
]

export function sortByFallbackPriority(providers: FullProviderConfig[]): FullProviderConfig[] {
  return [...providers].sort((a, b) => {
    const indexA = DEFAULT_FALLBACK_ORDER.indexOf(a.provider)
    const indexB = DEFAULT_FALLBACK_ORDER.indexOf(b.provider)
    const orderA = indexA === -1 ? 999 : indexA
    const orderB = indexB === -1 ? 999 : indexB
    return orderA - orderB
  })
}
