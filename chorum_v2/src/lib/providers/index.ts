import type {
  ChatMessage,
  ChatResult,
  ProviderCallConfig,
  SecuritySettings,
  ToolDefinition,
  ToolCall,
  ToolResult,
} from './types'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { callGoogle } from './google'
import { callMistral } from './mistral'
import { callDeepSeek } from './deepseek'
import { callOllama } from './ollama'
import { callOpenAICompatible } from './openai-compatible'
import {
  MODEL_REGISTRY,
  getCheapModel as getRegistryCheapModel,
  BACKGROUND_PROVIDER_PREFERENCE as REGISTRY_BACKGROUND_PREFERENCE,
  getDefaultModel,
  getContextWindow,
  getDefaultBaseUrl,
  normalizeProviderId,
} from './registry'

export type {
  ChatMessage,
  ChatResult,
  ProviderCallConfig,
  SecuritySettings,
  ToolDefinition,
  ToolCall,
  ToolResult,
}

export interface FullProviderConfig extends ProviderCallConfig {
  provider: string
}

export { getDefaultModel, getContextWindow, getDefaultBaseUrl }
export { normalizeProviderId }

export const CHEAP_MODELS: Record<string, string> = {}
export const BACKGROUND_PROVIDER_PREFERENCE = REGISTRY_BACKGROUND_PREFERENCE

export function getCheapModel(provider: string): string {
  return getRegistryCheapModel(provider)
}

export function resolveModelForProvider(provider: string, model: string): string {
  const normalizedProvider = normalizeProviderId(provider)
  if (model === 'auto') {
    return getDefaultModel(normalizedProvider) || model
  }
  return model
}

export async function callProvider(
  config: FullProviderConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  const providerId = normalizeProviderId(config.provider)
  const resolvedModel = resolveModelForProvider(providerId, config.model)
  const callConfig: ProviderCallConfig = {
    apiKey: config.apiKey,
    model: resolvedModel,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.isLocal !== undefined ? { isLocal: config.isLocal } : {}),
    ...(config.securitySettings !== undefined ? { securitySettings: config.securitySettings } : {}),
    ...(config.tools !== undefined ? { tools: config.tools } : {}),
    ...(config.toolChoice !== undefined ? { toolChoice: config.toolChoice } : {}),
  }

  switch (providerId) {
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
      return callOpenAICompatible({
        ...callConfig,
        baseUrl: callConfig.baseUrl || 'https://api.perplexity.ai',
      }, messages, systemPrompt)
    case 'xai':
      return callOpenAICompatible({
        ...callConfig,
        baseUrl: callConfig.baseUrl || 'https://api.x.ai/v1',
      }, messages, systemPrompt)
    case 'glm':
      return callOpenAICompatible({
        ...callConfig,
        baseUrl: callConfig.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
      }, messages, systemPrompt)
    case 'ollama':
      return callOllama(callConfig, messages, systemPrompt)
    case 'lmstudio':
    case 'openai-compatible':
      return callOpenAICompatible(callConfig, messages, systemPrompt)
    default:
      if (config.baseUrl) {
        return callOpenAICompatible(callConfig, messages, systemPrompt)
      }
      throw new Error(
        `Unsupported provider: ${config.provider}. Provide baseUrl for custom providers.`,
      )
  }
}

export function isProviderSupported(provider: string): boolean {
  return !!MODEL_REGISTRY[normalizeProviderId(provider)]
}
