import { createBinaryStar } from '@/lib/core'
import type { DomainSignal } from '@/lib/core'
import { createNebula } from '@/lib/nebula'
import { callProvider, getDefaultModel, normalizeProviderId } from '@/lib/providers'
import type { ChatMessage } from '@/lib/providers'
import { detectScopes } from '@/lib/customization/scope-detection'
import { computeEmbedding } from '@/lib/customization/extraction'
import { getUserProviders } from './provider-configs'
import { route } from './router'
import type { AgentChatInput, AgentChatResult, AgentDefinition } from './types'

function buildSystemPrompt(persona: AgentDefinition, context: string): string {
  const template = persona.systemPromptTemplate
  return template.includes('{{context}}')
    ? template.replace('{{context}}', context)
    : (context ? `${context}\n\n${template}` : template)
}

export async function chatSync(input: AgentChatInput): Promise<AgentChatResult> {
  const decision = await route(
    input.message,
    input.userId,
    input.agentId,
    input.domainSignal,
    input.contextWindowSize,
  )

  const nebula = createNebula()
  const binaryStar = createBinaryStar(nebula)

  const scopes = input.scopeHints ?? await detectScopes(input.message, input.userId)
  const domainSignal: DomainSignal = input.domainSignal ?? {
    primary: null,
    confidence: 0,
    detected: scopes,
  }

  let queryEmbedding: number[] = []
  try {
    queryEmbedding = await computeEmbedding(input.message)
  } catch {
    queryEmbedding = []
  }

  const podiumResult = await binaryStar.getContext({
    userId: input.userId,
    conversationId: input.conversationId,
    queryText: input.message,
    queryEmbedding,
    scopeFilter: decision.persona.scopeFilter,
    domainSignal,
    intent: 'question',
    contextWindowSize: decision.contextWindowSize,
  })

  const systemPrompt = buildSystemPrompt(decision.persona, podiumResult.compiledContext)
  const providers = await getUserProviders(input.userId)
  const selectedProvider = input.selectedProvider ? normalizeProviderId(input.selectedProvider) : null
  const explicitProviderConfig = selectedProvider
    ? providers.find((provider) => provider.provider === selectedProvider && provider.isEnabled)
    : null
  if (selectedProvider && !explicitProviderConfig) {
    throw new Error(`Provider ${selectedProvider} not configured`)
  }

  const resolvedProvider = explicitProviderConfig?.provider ?? decision.provider
  const resolvedModel = explicitProviderConfig
    ? (explicitProviderConfig.modelOverride ?? getDefaultModel(explicitProviderConfig.provider) ?? decision.model)
    : decision.model
  const providerConfig = explicitProviderConfig
    ?? providers.find((provider) => provider.provider === decision.provider && provider.isEnabled)
  if (!providerConfig) {
    throw new Error(`Provider ${resolvedProvider} not configured`)
  }

  const messages: ChatMessage[] = [
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: 'user', content: input.message },
  ]

  const callConfig = {
    provider: resolvedProvider,
    apiKey: providerConfig.apiKey,
    model: resolvedModel,
    isLocal: providerConfig.isLocal,
    ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
  }

  const result = await callProvider(callConfig, messages, systemPrompt)

  return {
    response: result.content,
    agentUsed: decision.persona,
    injectedContext: podiumResult.compiledContext,
    tokensUsed: result.tokensInput + result.tokensOutput,
    conversationId: input.conversationId,
    model: result.model ?? resolvedModel,
    provider: resolvedProvider,
  }
}

export async function* chat(input: AgentChatInput): AsyncGenerator<string> {
  const result = await chatSync(input)
  yield result.response
}
