import { z } from 'zod'
import type { DomainSignal } from '@/lib/core'
import type { ScopeFilter } from '@/lib/nebula/types'

export type PersonaTier = 'thinking' | 'balanced' | 'fast'

export interface AgentDefinition {
  id: string
  name: string
  description: string
  scopeFilter: ScopeFilter
  systemPromptTemplate: string
  defaultProvider: string | null
  defaultModel: string | null
  temperature: number
  maxTokens: number
  allowedTools: string[]
  isSystem: boolean
  tier: PersonaTier | null   // null = 'balanced' (default)
}

export interface AgentChatInput {
  userId: string
  conversationId: string
  message: string
  agentId?: string
  history: { role: 'user' | 'assistant'; content: string }[]
  contextWindowSize: number
  scopeHints?: string[]
  domainSignal?: DomainSignal
}

export interface AgentChatResult {
  response: string
  agentUsed: AgentDefinition
  injectedContext: string
  tokensUsed: number
  conversationId: string
  model: string
  provider: string
}

export interface ProviderConfig {
  id: string
  userId: string
  provider: string
  apiKey: string
  modelOverride: string | null
  baseUrl: string | null
  isLocal: boolean
  isEnabled: boolean
  priority: number
}

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical'

export interface RoutingDecision {
  persona: AgentDefinition
  provider: string
  model: string
  contextWindowSize: number
  reason: string
}

export const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  systemPrompt: z.string().min(1).max(10_000),
  defaultProvider: z.string().nullable().default(null),
  defaultModel: z.string().nullable().default(null),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(200_000).default(4096),
  scopeFilter: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    boost: z.array(z.string()).default([]),
  }).default({ include: [], exclude: [], boost: [] }),
  allowedTools: z.array(z.string()).default([]),
})

export type CreatePersonaInput = z.infer<typeof CreatePersonaSchema>

export const SaveProviderConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  modelOverride: z.string().nullable().default(null),
  baseUrl: z.string().nullable().default(null),
  isLocal: z.boolean().default(false),
  priority: z.number().int().min(0).default(0),
})

export type SaveProviderConfigInput = z.infer<typeof SaveProviderConfigSchema>
