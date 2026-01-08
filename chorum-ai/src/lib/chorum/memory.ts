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
const IMMEDIATE_CONTEXT_LIMIT = 3 // Always inject last 3 messages
const SUMMARIZE_THRESHOLD = 20 // Summarize when this many messages exceed recent limit

// Patterns that indicate user is referencing past conversation
const HISTORY_REFERENCE_PATTERNS = [
    // Explicit references
    /\bas\s+we\s+(discussed|talked\s+about|mentioned|covered)/i,
    /\blike\s+(last\s+time|before|earlier|previously)/i,
    /\b(remember|recall)\s+(when|that|the)/i,
    /\bthe\s+(bug|issue|problem|error|feature|thing)\s+(from|we\s+discussed)/i,
    /\b(yesterday|last\s+week|earlier\s+today|this\s+morning)/i,
    // Continuation references
    /\bcontinue\s+(with|from|where)/i,
    /\bback\s+to\s+(the|that|what)/i,
    /\bwhat\s+(did|were)\s+(we|you)\s+(say|discuss|decide)/i,
    /\b(same|that)\s+(approach|method|solution|fix)/i,
    // Implicit history needs
    /\bwhy\s+did\s+(we|you|i)\s+(choose|decide|go\s+with)/i,
    /\bwhat\s+was\s+(the|that)\s+(reason|decision|conclusion)/i,
    /\bcan\s+you\s+remind\s+me/i,
    /\bwhere\s+were\s+we/i,
]

export type MemoryStrategy = 'immediate' | 'full' | 'summary_only'

export interface RelevantMemoryResult extends ConversationMemory {
    strategy: MemoryStrategy
    historyReferenceDetected: boolean
}

/**
 * Detect if user query references past conversation history
 * Returns true if the query contains phrases like "as we discussed", "like last time", etc.
 */
export function detectHistoryReference(query: string): boolean {
    const normalizedQuery = query.toLowerCase().trim()

    for (const pattern of HISTORY_REFERENCE_PATTERNS) {
        if (pattern.test(normalizedQuery)) {
            return true
        }
    }

    return false
}

/**
 * Get relevant memory based on the current query
 * Uses query-aware logic to determine how much history to inject:
 * - If query references history → full context (10 messages + summary)
 * - If no history reference → immediate context only (3 messages + summary)
 */
export async function getRelevantMemory(
    projectId: string,
    currentQuery: string,
    maxMessages: number = DEFAULT_RECENT_LIMIT
): Promise<RelevantMemoryResult> {
    const needsHistory = detectHistoryReference(currentQuery)

    // Get latest summary (always useful for context)
    const latestSummary = await db.query.memorySummaries.findFirst({
        where: eq(memorySummaries.projectId, projectId),
        orderBy: [desc(memorySummaries.createdAt)]
    })

    if (!needsHistory) {
        // Fast path: just use immediate context (last 3) + summary
        const recentMessages = await db.query.messages.findMany({
            where: and(
                eq(messages.projectId, projectId),
                eq(messages.isArchived, false)
            ),
            orderBy: [desc(messages.createdAt)],
            limit: IMMEDIATE_CONTEXT_LIMIT
        })

        const chronological = recentMessages.reverse()

        return {
            summary: latestSummary?.summary || null,
            recentMessages: chronological.map(m => ({
                role: m.role,
                content: m.content
            })),
            strategy: 'immediate',
            historyReferenceDetected: false
        }
    }

    // History reference detected: grab full context
    const recentMessages = await db.query.messages.findMany({
        where: and(
            eq(messages.projectId, projectId),
            eq(messages.isArchived, false)
        ),
        orderBy: [desc(messages.createdAt)],
        limit: maxMessages
    })

    const chronological = recentMessages.reverse()

    return {
        summary: latestSummary?.summary || null,
        recentMessages: chronological.map(m => ({
            role: m.role,
            content: m.content
        })),
        strategy: 'full',
        historyReferenceDetected: true
    }
}

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
