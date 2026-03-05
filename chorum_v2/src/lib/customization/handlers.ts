import { createNebula } from '@/lib/nebula'
import { createBinaryStar } from '@/lib/core'
import type { DomainSignal, PodiumRequest } from '@/lib/core'
import type { CreateLearningInput } from '@/lib/nebula'
import type {
  AuthContext,
  EndSessionParams,
  EndSessionResult,
  ExtractLearningsParams,
  ExtractLearningsResult,
  GetContextParams,
  GetContextResult,
  InjectLearningParams,
  InjectLearningResult,
  ReadNebulaParams,
  ReadNebulaResult,
  StartSessionParams,
  StartSessionResult,
  SubmitFeedbackParams,
  SubmitFeedbackResult,
} from './types'
import { detectScopes } from './scope-detection'
import { findProjectByScopes } from './project-association'
import { closeConversation, createConversation, getConversation } from './sessions'
import { computeEmbedding, extractLearningsFromHistory } from './extraction'

function getNebula() {
  return createNebula()
}

function getBinaryStar() {
  return createBinaryStar(getNebula())
}

export async function handleReadNebula(
  params: ReadNebulaParams,
  auth: AuthContext,
): Promise<ReadNebulaResult> {
  const nebula = getNebula()

  if (params.learningId) {
    const learning = await nebula.getLearning(params.learningId)
    if (!learning || learning.userId !== auth.userId) {
      return { learnings: [], total: 0 }
    }
    return { learnings: [learning], total: 1 }
  }

  const scopes = params.scopes ?? []
  const all = await nebula.getLearningsByScope(scopes, params.userId)
  const filtered = params.type ? all.filter((l) => l.type === params.type) : all
  const total = filtered.length
  const page = filtered.slice(params.offset, params.offset + params.limit)

  return { learnings: page, total }
}

export async function handleGetContext(
  params: GetContextParams,
  _auth: AuthContext,
): Promise<GetContextResult> {
  const binaryStar = getBinaryStar()

  const domainSignal: DomainSignal = params.domainSignal ?? {
    primary: null,
    confidence: 0,
    detected: [],
  }

  const request: PodiumRequest = {
    userId: params.userId,
    conversationId: params.conversationId,
    queryText: params.queryText,
    queryEmbedding: params.queryEmbedding,
    scopeFilter: params.scopeFilter,
    domainSignal,
    intent: params.intent,
    contextWindowSize: params.contextWindowSize,
  }

  const result = await binaryStar.getContext(request)

  return {
    compiledContext: result.compiledContext,
    injectedItems: result.injectedItems,
    tierUsed: result.tierUsed,
    tokensUsed: result.tokensUsed,
  }
}

export async function handleStartSession(
  params: StartSessionParams,
  auth: AuthContext,
): Promise<StartSessionResult> {
  const binaryStar = getBinaryStar()

  let detectedScopes = params.scopeHints ?? []
  if (params.initialQuery && detectedScopes.length === 0) {
    detectedScopes = await detectScopes(params.initialQuery, auth.userId)
  }

  const associatedProject = await findProjectByScopes(detectedScopes, auth.userId)
  const conversationInput: {
    userId: string
    scopeTags: string[]
    projectId: string | null
    sessionId?: string
    metadata?: Record<string, unknown>
  } = {
    userId: auth.userId,
    scopeTags: detectedScopes,
    projectId: associatedProject?.id ?? null,
  }
  if (params.sessionId !== undefined) conversationInput.sessionId = params.sessionId
  if (params.metadata !== undefined) conversationInput.metadata = params.metadata

  const conversationId = await createConversation(conversationInput)

  let prefetchedContext = ''
  let injectedItems: StartSessionResult['injectedItems'] = []

  if (params.initialQuery) {
    const embedding = await computeEmbedding(params.initialQuery)
    const scopeFilter = associatedProject?.scopeFilter ?? {
      include: detectedScopes,
      exclude: [],
      boost: [],
    }

    const result = await binaryStar.getContext({
      userId: auth.userId,
      conversationId,
      queryText: params.initialQuery,
      queryEmbedding: embedding,
      scopeFilter,
      domainSignal: { primary: null, confidence: 0, detected: detectedScopes },
      intent: 'question',
      contextWindowSize: params.contextWindowSize,
    })

    prefetchedContext = result.compiledContext
    injectedItems = result.injectedItems
  }

  return {
    conversationId,
    prefetchedContext,
    detectedScopes,
    associatedProject: associatedProject?.name ?? null,
    injectedItems,
  }
}

export async function handleInjectLearning(
  params: InjectLearningParams,
  _auth: AuthContext,
): Promise<InjectLearningResult> {
  const nebula = getNebula()
  const binaryStar = getBinaryStar()

  const isManual = params.extractionMethod === 'manual'
  const confidenceBase = isManual ? (params.confidenceBase ?? 0.5) : 0.3
  let scopes = params.scopes

  if (!scopes || scopes.length === 0) {
    scopes = await detectScopes(params.content, params.userId)
  }

  if (scopes.length === 0 && params.conversationId) {
    const conversation = await getConversation(params.conversationId, params.userId)
    const conversationScopes = conversation?.scopeTags as string[] | undefined
    scopes = conversationScopes ?? []
  }

  if (scopes.length === 0) {
    scopes = extractAdHocScopes(params.content)
  }

  const createInput: CreateLearningInput = {
    userId: params.userId,
    content: params.content,
    type: params.type,
    scopes,
    extractionMethod: params.extractionMethod,
    confidenceBase,
  }

  if (params.embedding !== undefined) createInput.embedding = params.embedding
  if (params.embeddingDims !== undefined) createInput.embeddingDims = params.embeddingDims
  if (params.embeddingModel !== undefined) createInput.embeddingModel = params.embeddingModel

  const learning = await nebula.createLearning(createInput)

  let proposalId: string | null = null
  if (!isManual) {
    const proposal = await binaryStar.createProposal(
      params.userId,
      learning.id,
      'promote',
      0.2,
      `Auto-extracted learning requires human approval. Content: "${params.content.slice(0, 100)}..."`,
    )
    proposalId = proposal.id
  }

  return {
    learning,
    proposalCreated: !isManual,
    proposalId,
  }
}

export async function handleSubmitFeedback(
  params: SubmitFeedbackParams,
  _auth: AuthContext,
): Promise<SubmitFeedbackResult> {
  const binaryStar = getBinaryStar()
  const signalType = params.source === 'llm_judge' ? 'end_of_session_judge' : params.source

  await binaryStar.submitSignal({
    type: signalType,
    learningId: params.learningId,
    conversationId: params.conversationId ?? '',
    injectionId: params.injectionId ?? '',
    signal: params.signal,
    source: params.source,
    timestamp: new Date(),
  })

  return { processed: true }
}

export async function handleExtractLearnings(
  params: ExtractLearningsParams,
  auth: AuthContext,
): Promise<ExtractLearningsResult> {
  const extracted = await extractLearningsFromHistory(
    params.userId,
    params.conversationId,
    params.conversationHistory,
    params.scopeHints,
    async (input) => {
      const result = await handleInjectLearning({
        userId: input.userId,
        conversationId: input.conversationId,
        content: input.content,
        type: input.type,
        scopes: input.scopes,
        extractionMethod: 'auto',
      }, auth)

      return { proposalCreated: result.proposalCreated }
    },
  )

  return {
    extracted: extracted.map((item) => ({
      content: item.content,
      type: item.type,
      scopes: item.scopes,
      confidenceBase: item.confidenceBase,
      proposalCreated: item.proposalCreated,
    })),
    totalExtracted: extracted.length,
  }
}

export async function handleEndSession(
  params: EndSessionParams,
  auth: AuthContext,
): Promise<EndSessionResult> {
  const binaryStar = getBinaryStar()

  let extractedCount = 0
  if (params.conversationHistory && params.conversationHistory.length > 0) {
    const extracted = await extractLearningsFromHistory(
      params.userId,
      params.conversationId,
      params.conversationHistory,
      undefined,
      async (input) => {
        const result = await handleInjectLearning({
          userId: input.userId,
          conversationId: input.conversationId,
          content: input.content,
          type: input.type,
          scopes: input.scopes,
          extractionMethod: 'auto',
        }, auth)

        return { proposalCreated: result.proposalCreated }
      },
    )
    extractedCount = extracted.length
  }

  const conversation = await closeConversation(params.conversationId, extractedCount, params.userId)
  const duration = conversation
    ? Math.floor((Date.now() - conversation.startedAt.getTime()) / 1000)
    : 0

  void binaryStar.maybeFireSessionJudge(params.userId, params.conversationId, []).catch(() => undefined)

  return {
    extractedLearnings: extractedCount,
    sessionDuration: duration,
    closed: true,
  }
}

function extractAdHocScopes(content: string): string[] {
  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'will',
    'your', 'about', 'there', 'their', 'what', 'when', 'where', 'which',
  ])

  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopwords.has(word))

  const deduped = [...new Set(words)].slice(0, 3).map((word) => `#${word}`)
  return deduped.length > 0 ? deduped : ['#context']
}
