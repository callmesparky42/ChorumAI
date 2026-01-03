import { db } from '@/lib/db'
import { messages, memorySummaries } from '@/lib/db/schema'
import { eq, and, desc, asc, lt } from 'drizzle-orm'

export interface ConversationMemory {
    summary: string | null
    recentMessages: Array<{
        role: string
        content: string
    }>
}

const DEFAULT_RECENT_LIMIT = 10
const SUMMARIZE_THRESHOLD = 20 // Summarize when this many messages exceed recent limit

/**
 * Get conversation memory for a project
 * Returns: latest summary + recent N messages
 */
export async function getConversationMemory(
    projectId: string,
    recentLimit: number = DEFAULT_RECENT_LIMIT
): Promise<ConversationMemory> {
    // Get latest summary
    const latestSummary = await db.query.memorySummaries.findFirst({
        where: eq(memorySummaries.projectId, projectId),
        orderBy: [desc(memorySummaries.createdAt)]
    })

    // Get recent non-archived messages
    const recentMessages = await db.query.messages.findMany({
        where: and(
            eq(messages.projectId, projectId),
            eq(messages.isArchived, false)
        ),
        orderBy: [desc(messages.createdAt)],
        limit: recentLimit
    })

    // Reverse to get chronological order
    const chronological = recentMessages.reverse()

    return {
        summary: latestSummary?.summary || null,
        recentMessages: chronological.map(m => ({
            role: m.role,
            content: m.content
        }))
    }
}

/**
 * Build context messages for LLM from memory
 */
export function buildMemoryContext(memory: ConversationMemory): Array<{ role: 'user' | 'assistant'; content: string }> {
    const contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    // Add summary as a "previous context" user message if exists
    if (memory.summary) {
        contextMessages.push({
            role: 'user',
            content: `[Previous conversation summary: ${memory.summary}]`
        })
        contextMessages.push({
            role: 'assistant',
            content: 'I understand the context from our previous conversation. How can I continue helping you?'
        })
    }

    // Add recent messages
    for (const msg of memory.recentMessages) {
        contextMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
        })
    }

    return contextMessages
}

/**
 * Count non-archived messages for a project
 */
export async function getMessageCount(projectId: string): Promise<number> {
    const msgs = await db.query.messages.findMany({
        where: and(
            eq(messages.projectId, projectId),
            eq(messages.isArchived, false)
        )
    })
    return msgs.length
}

/**
 * Get oldest messages for summarization
 */
export async function getMessagesForSummarization(
    projectId: string,
    limit: number
): Promise<Array<{ id: string; role: string; content: string; createdAt: Date | null }>> {
    const msgs = await db.query.messages.findMany({
        where: and(
            eq(messages.projectId, projectId),
            eq(messages.isArchived, false)
        ),
        orderBy: [asc(messages.createdAt)],
        limit
    })
    return msgs
}

/**
 * Archive messages by IDs
 */
export async function archiveMessages(messageIds: string[]): Promise<void> {
    for (const id of messageIds) {
        await db.update(messages)
            .set({ isArchived: true })
            .where(eq(messages.id, id))
    }
}

/**
 * Save a new memory summary
 */
export async function saveMemorySummary(
    projectId: string,
    summary: string,
    messageCount: number,
    fromDate: Date,
    toDate: Date
): Promise<void> {
    await db.insert(memorySummaries).values({
        projectId,
        summary,
        messageCount,
        fromDate,
        toDate
    })
}
