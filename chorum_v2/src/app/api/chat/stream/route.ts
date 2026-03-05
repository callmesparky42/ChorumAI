import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { createAgent } from '@/lib/agents'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const StreamChatRequestSchema = z.object({
    conversationId: z.string().uuid(),
    message: z.string().min(1),
    personaId: z.string().uuid().optional(),
    selectedProvider: z.string().optional(),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
    })),
    attachments: z.array(z.object({
        type: z.string(),
        name: z.string(),
        content: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number()
    })).optional().default([])
})

function sseEvent(data: object): string {
    return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) {
        return new Response('Unauthorized', { status: 401 })
    }

    try {
        checkRateLimit(authCtx.userId)
    } catch {
        return new Response('Too Many Requests', { status: 429 })
    }

    // Parse body
    let body: unknown
    try {
        body = await request.json()
    } catch {
        return new Response('Invalid JSON', { status: 400 })
    }

    const parsed = StreamChatRequestSchema.safeParse(body)
    if (!parsed.success) {
        return new Response(JSON.stringify(parsed.error.issues), { status: 400 })
    }
    const { conversationId, message, personaId, history, attachments } = parsed.data

    // Verify conversation ownership
    const conv = await db.query.conversations.findFirst({
        where: and(eq(conversations.id, conversationId), eq(conversations.userId, authCtx.userId))
    })
    if (!conv) {
        return new Response('Forbidden', { status: 403 })
    }

    // Build message with attachments appended as text context
    let fullMessage = message
    if (attachments && attachments.length > 0) {
        const textAttachments = attachments.filter(a =>
            a.type !== 'image' && a.type !== 'pdf'
        )
        if (textAttachments.length > 0) {
            const attachedContent = textAttachments
                .map(a => `\n\n<document filename="${a.name}">\n${a.content}\n</document>`)
                .join('')
            fullMessage = message + attachedContent
        }
    }

    const agent = createAgent()
    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder()
            const emit = (data: object) => {
                controller.enqueue(enc.encode(sseEvent(data)))
            }

            try {
                let fullResponse = ''
                const chatInput = {
                    userId: authCtx.userId,
                    conversationId,
                    message: fullMessage,
                    history,
                    contextWindowSize: 16000,
                    ...(personaId ? { agentId: personaId } : {}),
                }
                for await (const chunk of agent.chat(chatInput)) {
                    fullResponse += chunk
                    emit({ type: 'token', token: chunk })
                }

                emit({
                    type: 'meta',
                    meta: {
                        tokensUsed: Math.ceil(fullResponse.length / 4),
                        model: 'auto',
                        agentUsed: personaId ?? '',
                        conversationId,
                    }
                })
                emit({ type: 'done' })
            } catch (err) {
                emit({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
            } finally {
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    })
}
