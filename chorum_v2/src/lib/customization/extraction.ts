import { callProvider } from '@/lib/providers'
import { resolveTaskProvider } from '@/lib/providers/task-router'
import type { ChatMessage } from '@/lib/providers'
import type { LearningType } from '@/lib/nebula/types'

interface ExtractionCandidateInput {
  content: string
  type: LearningType
  scopes: string[]
}

interface ExtractionCandidate {
  content: string
  type: LearningType
  scopes: string[]
  confidenceBase: number
  proposalCreated: boolean
}

interface InjectLearningAdapter {
  userId: string
  conversationId: string
  content: string
  type: LearningType
  scopes: string[]
}

const EXTRACTION_PROMPT = `Analyze the following conversation and extract discrete learnings worth remembering for future conversations with this user. For each learning, provide:

1. content: A clear, standalone statement of the learning (not a quote — rephrase for clarity)
2. type: One of: invariant, pattern, decision, antipattern, golden_path, anchor, character, setting, plot_thread, voice, world_rule
3. scopes: Array of scope tags (e.g., "#python", "#trading", "#fiction") — be specific, never use "#general"

Rules:
- Only extract things the USER stated, decided, or confirmed
- Skip greetings, small talk, and meta-conversation
- Each learning must be independently understandable without conversation context
- Prefer specificity over generality
- If nothing worth extracting exists, return an empty array

Return JSON array: [{ "content": "...", "type": "...", "scopes": ["..."] }]`

export async function extractLearningsFromHistory(
  userId: string,
  conversationId: string,
  history: Array<{ role: string; content: string }>,
  scopeHints: string[] | undefined,
  injectLearning: (input: InjectLearningAdapter) => Promise<{ proposalCreated: boolean }>,
): Promise<ExtractionCandidate[]> {
  if (history.length === 0) return []

  const formatted = history
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n')

  const candidates = await callExtractionProvider(userId, EXTRACTION_PROMPT, formatted)
  if (!candidates.length) return []

  const results: ExtractionCandidate[] = []
  for (const candidate of candidates) {
    const mergedScopes = [...new Set([...(candidate.scopes ?? []), ...(scopeHints ?? [])])]
    if (mergedScopes.length === 0) continue

    try {
      const result = await injectLearning({
        userId,
        conversationId,
        content: candidate.content,
        type: candidate.type,
        scopes: mergedScopes,
      })

      results.push({
        content: candidate.content,
        type: candidate.type,
        scopes: mergedScopes,
        confidenceBase: 0.3,
        proposalCreated: result.proposalCreated,
      })
    } catch {
      // Skip failed candidate and continue.
    }
  }

  return results
}

export async function computeEmbedding(text: string, userId?: string): Promise<number[]> {
  // Try task-routed embedding provider first (uses task-router 3-tier resolution)
  const provider = await resolveTaskProvider(userId, 'embedding')

  if (provider && provider.provider === 'openai') {
    // OpenAI-specific embedding call
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: provider.model.includes('embedding') ? provider.model : 'text-embedding-3-small',
          input: text,
        }),
      })
      if (!response.ok) return []
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>
      }
      return payload.data?.[0]?.embedding ?? []
    } catch {
      return []
    }
  }

  // Env var fallback (legacy path for callers without userId)
  const openAiKey = process.env.OPENAI_API_KEY
  if (!openAiKey) return []

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    })

    if (!response.ok) return []
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    return payload.data?.[0]?.embedding ?? []
  } catch {
    return []
  }
}

async function callExtractionProvider(
  userId: string,
  systemPrompt: string,
  conversationText: string,
): Promise<ExtractionCandidateInput[]> {
  const providerConfig = await resolveExtractionProvider(userId)
  if (!providerConfig) return []

  try {
    const messages: ChatMessage[] = [{ role: 'user', content: conversationText }]
    const callConfig = {
      provider: providerConfig.provider,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
      ...(providerConfig.isLocal !== undefined ? { isLocal: providerConfig.isLocal } : {}),
    }
    const result = await callProvider(callConfig, messages, systemPrompt)

    return parseExtractionCandidates(result.content)
  } catch {
    return []
  }
}

interface ResolvedProvider {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
  isLocal?: boolean
}

import { getUserProviders } from '@/lib/agents'

async function resolveExtractionProvider(userId: string): Promise<ResolvedProvider | null> {
  const resolved = await resolveTaskProvider(userId, 'extraction')
  if (!resolved) return null
  return {
    provider: resolved.provider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    ...(resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {}),
    ...(resolved.isLocal ? { isLocal: resolved.isLocal } : {}),
  }
}

function parseExtractionCandidates(raw: string): ExtractionCandidateInput[] {
  const normalized = raw.trim()
  if (!normalized) return []

  const fromFence = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const payload = fromFence ?? normalized

  try {
    const parsed = JSON.parse(payload) as Array<{
      content?: string
      type?: string
      scopes?: string[]
    }>
    if (!Array.isArray(parsed)) return []

    const allowedTypes = new Set<LearningType>([
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
    ])

    return parsed
      .filter((item) => typeof item.content === 'string' && typeof item.type === 'string')
      .map((item) => ({
        content: item.content!.trim(),
        type: (allowedTypes.has(item.type as LearningType) ? item.type : 'pattern') as LearningType,
        scopes: Array.isArray(item.scopes)
          ? item.scopes.filter((scope): scope is string => typeof scope === 'string')
          : [],
      }))
      .filter((item) => item.content.length > 0)
  } catch {
    return []
  }
}
