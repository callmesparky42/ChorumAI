import { z } from 'zod'
import type { Learning, LearningType, TokenScope } from '@/lib/nebula/types'
import type { InjectedLearning } from '@/lib/core'

const VALID_LEARNING_TYPES = [
  'invariant',
  'pattern',
  'decision',
  'antipattern',
  'golden_path',
  'anchor',
  'character',
  'setting',
  'plot_thread',
  'voice',
  'world_rule',
] as const satisfies readonly LearningType[]

// ---------------------------------------------------------------------------
// Task-specific provider config — each task can route to a different provider
// ---------------------------------------------------------------------------

export const TaskProviderConfigSchema = z.object({
  provider: z.string(),                                          // must match a row in provider_configs
  model: z.string().optional(),                                  // overrides modelOverride on provider_configs
  maxTokens: z.number().int().positive().optional(),             // caps completion tokens for this task
  dailyTokenLimit: z.number().int().positive().optional(),       // in-memory rate limit (resets at UTC midnight)
})

export type TaskProviderConfig = z.infer<typeof TaskProviderConfigSchema>

export type TaskName = 'judge' | 'embedding' | 'extraction' | 'chat'

export const UserCustomizationSchema = z.object({
  halfLifeOverrides: z.partialRecord(z.enum(VALID_LEARNING_TYPES), z.number().positive()).optional(),
  confidenceFloorOverrides: z.partialRecord(z.enum(VALID_LEARNING_TYPES), z.number().min(0).max(1)).optional(),
  qualityThreshold: z.number().min(0).max(1).optional(),
  judgeEnabled: z.boolean().optional(),
  taskProviders: z.object({
    judge: TaskProviderConfigSchema.optional(),
    embedding: TaskProviderConfigSchema.optional(),
    extraction: TaskProviderConfigSchema.optional(),
    chat: TaskProviderConfigSchema.optional(),
  }).optional(),
})

export type UserCustomization = z.infer<typeof UserCustomizationSchema>

export const ReadNebulaParamsSchema = z.object({
  userId: z.string().uuid(),
  learningId: z.string().uuid().optional(),
  scopes: z.array(z.string()).optional(),
  type: z.enum(VALID_LEARNING_TYPES).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})

export type ReadNebulaParams = z.infer<typeof ReadNebulaParamsSchema>

export interface ReadNebulaResult {
  learnings: Learning[]
  total: number
}

export const GetContextParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  queryText: z.string().min(1),
  queryEmbedding: z.array(z.number()),
  scopeFilter: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    boost: z.array(z.string()).default([]),
  }),
  domainSignal: z.object({
    primary: z.string().nullable().default(null),
    confidence: z.number().min(0).max(1).default(0),
    detected: z.array(z.string()).default([]),
  }).optional(),
  intent: z.enum([
    'question',
    'generation',
    'analysis',
    'debugging',
    'discussion',
    'continuation',
    'greeting',
  ] as const).default('question'),
  contextWindowSize: z.number().int().min(1).default(16000),
})

export type GetContextParams = z.infer<typeof GetContextParamsSchema>

export interface GetContextResult {
  compiledContext: string
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
}

export const StartSessionParamsSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().optional(),
  initialQuery: z.string().optional(),
  scopeHints: z.array(z.string()).optional(),
  contextWindowSize: z.number().int().min(1).default(16000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type StartSessionParams = z.infer<typeof StartSessionParamsSchema>

export interface StartSessionResult {
  conversationId: string
  prefetchedContext: string
  detectedScopes: string[]
  associatedProject: string | null
  injectedItems: InjectedLearning[]
}

export const InjectLearningParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  content: z.string().min(1).max(10_000),
  type: z.enum(VALID_LEARNING_TYPES),
  scopes: z.array(z.string().min(1)).default([]),
  extractionMethod: z.enum(['manual', 'auto', 'import']).default('manual'),
  confidenceBase: z.number().min(0).max(1).optional(),
  embedding: z.array(z.number()).optional(),
  embeddingDims: z.union([z.literal(384), z.literal(1536)]).optional(),
  embeddingModel: z.string().optional(),
})

export type InjectLearningParams = z.infer<typeof InjectLearningParamsSchema>

export interface InjectLearningResult {
  learning: Learning
  proposalCreated: boolean
  proposalId: string | null
}

export const SubmitFeedbackParamsSchema = z.object({
  userId: z.string().uuid(),
  learningId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  injectionId: z.string().uuid().optional(),
  signal: z.enum(['positive', 'negative', 'none']),
  source: z.enum(['explicit', 'heuristic', 'inaction', 'llm_judge']).default('explicit'),
})

export type SubmitFeedbackParams = z.infer<typeof SubmitFeedbackParamsSchema>

export interface SubmitFeedbackResult {
  processed: true
}

export const ExtractLearningsParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  scopeHints: z.array(z.string()).optional(),
})

export type ExtractLearningsParams = z.infer<typeof ExtractLearningsParamsSchema>

export interface ExtractLearningsResult {
  extracted: Array<{
    content: string
    type: string
    scopes: string[]
    confidenceBase: number
    proposalCreated: boolean
  }>
  totalExtracted: number
}

export const EndSessionParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
})

export type EndSessionParams = z.infer<typeof EndSessionParamsSchema>

export interface EndSessionResult {
  extractedLearnings: number
  sessionDuration: number
  closed: true
}

export const MCPRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})

export type MCPRequest = z.infer<typeof MCPRequestSchema>

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface AuthContext {
  userId: string
  scopes: TokenScope[]
}

export const TOOL_SCOPES: Record<string, TokenScope> = {
  start_session: 'read:nebula',
  get_context: 'read:nebula',
  read_nebula: 'read:nebula',
  inject_learning: 'write:nebula',
  extract_learnings: 'write:nebula',
  submit_feedback: 'write:feedback',
  end_session: 'write:feedback',
}
