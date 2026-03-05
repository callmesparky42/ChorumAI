import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { conversations } from '@/db/schema'

interface CreateConversationInput {
  userId: string
  sessionId?: string
  scopeTags: string[]
  projectId?: string | null
  metadata?: Record<string, unknown>
}

export async function createConversation(input: CreateConversationInput): Promise<string> {
  const values: {
    userId: string
    scopeTags: string[]
    projectId: string | null
    metadata: Record<string, unknown>
    sessionId?: string
  } = {
    userId: input.userId,
    scopeTags: input.scopeTags,
    projectId: input.projectId ?? null,
    metadata: input.metadata ?? {},
  }
  if (input.sessionId !== undefined) values.sessionId = input.sessionId

  const [row] = await db
    .insert(conversations)
    .values(values)
    .returning({ id: conversations.id })

  return row?.id ?? ''
}

export async function getConversation(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)

  return row ?? null
}

export async function closeConversation(conversationId: string, extractedCount: number, userId: string) {
  const existing = await getConversation(conversationId, userId)
  if (!existing) return null

  const [row] = await db
    .update(conversations)
    .set({
      endedAt: new Date(),
      learningsExtracted: extractedCount,
    })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning()

  return row ?? existing
}
