// src/lib/core/conductor/judge.ts
// End-of-session LLM judge — async, post-conversation, opt-in only.
//
// Reads injected learning IDs, asks an LLM whether each was helpful,
// then creates ConductorProposals for the Inbox (HITL preserved).
//
// Enabled via: user_settings.customization.judgeEnabled = true
// Provider:    user_settings.customization.taskProviders.judge (falls back to first enabled)

import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { NebulaInterface } from '@/lib/nebula'
import { callProvider } from '@/lib/providers'
import { resolveTaskProvider, assertTaskBudget, recordTaskUsage } from '@/lib/providers/task-router'
import { createProposal } from './proposals'
import type { ProposalType } from '../interface'

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM_PROMPT = `You are an end-of-session reviewer for a personal knowledge management system.

You will receive a list of knowledge items that were injected into an AI's context during a conversation. Your job is to evaluate whether each item was actually relevant to the conversation.

For each item, return a verdict:
- "promote" — the item was clearly useful and relevant
- "demote"  — the item was not relevant and should have lower confidence
- "none"    — uncertain / not enough signal

Rules:
- Be conservative. Only promote if clearly helpful. Only demote if clearly irrelevant.
- Always return valid JSON.
- Short rationale only (max 1 sentence).

Return a JSON array:
[{ "learningId": "...", "verdict": "promote"|"demote"|"none", "rationale": "..." }]`

// ---------------------------------------------------------------------------
// Main judge function
// ---------------------------------------------------------------------------

export async function isJudgeEnabled(userId: string): Promise<boolean> {
  // Check new customization field first
  const { getUserCustomization } = await import('@/lib/customization/config')
  const cust = await getUserCustomization(userId).catch(() => null)
  if (cust?.judgeEnabled !== undefined) return cust.judgeEnabled

  // Legacy: fall back to endOfSessionJudgeEnabled DB column
  const rows = await db
    .select({ enabled: userSettings.endOfSessionJudgeEnabled })
    .from(userSettings)
    .where(eq(userSettings.id, userId))
    .limit(1)
  return rows[0]?.enabled ?? false
}

/**
 * Fire the end-of-session judge if the user has opted in.
 * Fetches injected learnings, asks the judge LLM, creates proposals.
 */
export async function maybeFireSessionJudge(
  userId: string,
  conversationId: string,
  injectedIds: string[],
  nebula: NebulaInterface,
): Promise<void> {
  const enabled = await isJudgeEnabled(userId)
  if (!enabled) return

  if (injectedIds.length === 0) {
    // Nothing was injected — nothing to judge
    return
  }

  const provider = await resolveTaskProvider(userId, 'judge')
  if (!provider) {
    console.warn('[Judge] No provider configured for judge task — skipping')
    return
  }

  try {
    assertTaskBudget(userId, 'judge', provider.dailyTokenLimit)
  } catch (err) {
    console.warn('[Judge] Daily token limit reached:', err)
    return
  }

  // Fetch the actual learning content for the injected IDs
  const learnings = await Promise.all(
    injectedIds.map((id) => nebula.getLearning(id).catch(() => null)),
  )
  const valid = learnings.filter(Boolean)

  if (valid.length === 0) return

  const learningList = valid
    .map((l) => `ID: ${l!.id}\nContent: ${l!.content}\nType: ${l!.type}`)
    .join('\n\n---\n\n')

  const userMessage = `Conversation ID: ${conversationId}\n\nInjected knowledge items:\n\n${learningList}`

  let result
  try {
    result = await callProvider(
      {
        provider: provider.provider,
        apiKey: provider.apiKey,
        model: provider.model,
        ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
        ...(provider.isLocal ? { isLocal: provider.isLocal } : {}),
      },
      [{ role: 'user', content: userMessage }],
      JUDGE_SYSTEM_PROMPT,
    )
  } catch (err) {
    console.error('[Judge] Provider call failed:', err)
    return
  }

  // Record usage (approximate — actual token count from provider not always available)
  recordTaskUsage(userId, 'judge', provider.maxTokens, provider.dailyTokenLimit)

  const verdicts = parseJudgeResponse(result.content)
  if (verdicts.length === 0) return

  // Create proposals for actionable verdicts (skip 'none')
  await Promise.allSettled(
    verdicts
      .filter((v) => v.verdict !== 'none')
      .map(async (v) => {
        const type: ProposalType = v.verdict === 'promote' ? 'promote' : 'demote'
        const delta = v.verdict === 'promote' ? 0.1 : -0.1
        await createProposal(userId, v.learningId, type, delta,
          `[LLM Judge] Session ${conversationId.slice(0, 8)}: ${v.rationale}`)
      }),
  )
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

interface JudgeVerdict {
  learningId: string
  verdict: 'promote' | 'demote' | 'none'
  rationale: string
}

function parseJudgeResponse(raw: string): JudgeVerdict[] {
  const normalized = raw.trim()
  const fromFence = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const payload = fromFence ?? normalized

  try {
    const parsed = JSON.parse(payload) as Array<{
      learningId?: string
      verdict?: string
      rationale?: string
    }>
    if (!Array.isArray(parsed)) return []

    const allowed = new Set(['promote', 'demote', 'none'])

    return parsed
      .filter((item) => typeof item.learningId === 'string' && typeof item.verdict === 'string')
      .map((item) => ({
        learningId: item.learningId!,
        verdict: (allowed.has(item.verdict!) ? item.verdict : 'none') as JudgeVerdict['verdict'],
        rationale: typeof item.rationale === 'string' ? item.rationale.slice(0, 200) : '',
      }))
  } catch {
    return []
  }
}
