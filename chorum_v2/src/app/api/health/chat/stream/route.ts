// src/app/api/health/chat/stream/route.ts
// Dedicated health-governed chat endpoint. Bypasses the Conductor, persona
// routing, and learning system entirely. Responds ONLY to health, nutrition,
// and medical topics — explicit refusal for everything else.
//
// SSE format matches /api/chat/stream so the mobile client parser is reused:
//   data: { "type": "token", "token": "..." }
//   data: { "type": "done" }
//   data: { "type": "error", "message": "..." }
export const runtime = 'nodejs'

import { NextRequest }                    from 'next/server'
import { authenticate }                   from '@/lib/customization/auth'
import { getUserProviders }               from '@/lib/agents/provider-configs'
import { callProvider }                   from '@/lib/providers'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import { logPhiAccess }                   from '@/lib/health/audit'
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

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  // Auth
  const auth = await authenticate(req)
  if (!auth) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Rate limiting — reuse 'chat' bucket from health rate limiter
  const rl = await checkRateLimit(auth.userId, 'chat')
  if (!rl.allowed) {
    return new Response('Rate limit exceeded', {
      status:  429,
      headers: rateLimitHeaders(rl),
    })
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.issues), { status: 400 })
  }
  const { message, history } = parsed.data

  // Provider selection — prefers claude-sonnet-4-6
  const providers      = await getUserProviders(auth.userId)
  const providerConfig = selectHealthProvider(providers)

  if (!providerConfig) {
    return new Response(
      JSON.stringify({ error: 'No AI provider configured. Add a provider in Chorum settings.' }),
      { status: 503 }
    )
  }

  // Build health context — de-identified snapshots from last 14 days
  const { contextBlock } = await buildHealthContext(auth.userId)

  // Audit log: user initiated a health chat session
  await logPhiAccess({
    userId:       auth.userId,
    actorId:      auth.userId,
    action:       'view',
    resourceType: 'snapshot',
  })

  // Build the full system prompt with injected health data
  const systemPrompt = buildSystemPrompt(contextBlock)

  // Messages: history + current message
  const messages = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ]

  // Stream the response via SSE
  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const emit = (data: object) => controller.enqueue(enc.encode(sseEvent(data)))

      try {
        const result = await callProvider(providerConfig, messages, systemPrompt)

        const content = typeof result === 'string' ? result : (result as { content?: string }).content ?? ''
        const chunks = content.match(/\S+\s*/g) ?? [content]
        for (const chunk of chunks) {
          emit({ type: 'token', token: chunk })
        }
        emit({ type: 'done' })
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Health chat error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      ...rateLimitHeaders(rl),
    },
  })
}
