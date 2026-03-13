// src/app/api/health/chat/route.ts
// Non-streaming health chat endpoint. Returns { content: string } as JSON.
// Used by the Phase 5 mobile app before the Phase 6 SSE streaming upgrade.
// Uses the same health governance system prompt and data context as the stream endpoint.
export const runtime = 'nodejs'

import { NextRequest, NextResponse }  from 'next/server'
import { authenticate }               from '@/lib/customization/auth'
import { getUserProviders }           from '@/lib/agents/provider-configs'
import { callProvider }               from '@/lib/providers'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import { logPhiAccess }               from '@/lib/health/audit'
import {
  selectHealthProvider,
  buildHealthContext,
  buildSystemPrompt,
} from '@/lib/health/health-chat'
import { z } from 'zod'

const RequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(20).default([]),
})

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'chat')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }
  const { message, history } = parsed.data

  const providers = await getUserProviders(auth.userId)
  const provider  = selectHealthProvider(providers)
  if (!provider) {
    return NextResponse.json({ error: 'No AI provider configured' }, { status: 503 })
  }

  const { contextBlock } = await buildHealthContext(auth.userId)
  const systemPrompt     = buildSystemPrompt(contextBlock)

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'view', resourceType: 'snapshot' })

  const messages = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ]

  try {
    const result  = await callProvider(provider, messages, systemPrompt)
    const content = typeof result === 'string' ? result : (result as { content?: string }).content ?? ''
    return NextResponse.json({ content })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Health chat error' },
      { status: 500 },
    )
  }
}
