import { db } from '@/lib/db'
import { messages } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import type { LearningItemMetadata } from './types'

export interface ProvenanceData {
    conversationId: string
    messageIds: string[]
    turnRange?: [number, number]
    verifiedAt: string
}

export interface GroundingResult {
    verified: boolean
    reason?: string
    source?: ProvenanceData
}

// Dependency Injection for testing
export type HistoryFetcher = (projectId: string, limit: number) => Promise<Array<{ id: string, content: string, conversationId: string | null }>>

const defaultHistoryFetcher: HistoryFetcher = async (projectId, limit) => {
    return await db.query.messages.findMany({
        where: and(
            eq(messages.projectId, projectId),
            eq(messages.isArchived, false)
        ),
        orderBy: [desc(messages.createdAt)],
        limit
    })
}

/**
 * Verify that a learning item is grounded in recent conversation history.
 * Prevents "poison pill" injections by requiring source text to be present.
 */
export async function verifyReference(
    content: string,
    projectId: string,
    historyFetcher: HistoryFetcher = defaultHistoryFetcher
): Promise<GroundingResult> {
    // 1. Get recent messages (last 50)
    const recentMessages = await historyFetcher(projectId, 50)

    if (recentMessages.length === 0) {
        return {
            verified: false,
            reason: 'No recent conversation history found to verify against.'
        }
    }

    // 2. Extract keywords from content
    // Simple heuristic: split by non-word chars, filter small words
    const keywords = extractKeywords(content)

    if (keywords.length === 0) {
        // If content is too abstract or symbol-heavy, might trip this.
        // Fallback: allow if it's very short and contained exactly?
        return {
            verified: false,
            reason: 'Content contains no verifiable keywords.'
        }
    }

    // 3. Search for keyword overlap in messages
    const supportingMessageIds = new Set<string>()
    let conversationId: string | null = null

    // We want to find a "cluster" of messages or a single message that contains most keywords
    // For "Source Tagging", we want to identify specific messages.

    for (const msg of recentMessages) {
        const msgContent = msg.content.toLowerCase()

        // Count how many keywords appear in this message
        let matchCount = 0
        for (const kw of keywords) {
            if (msgContent.includes(kw)) {
                matchCount++
            }
        }

        // If message contains > 50% of keywords, consider it a supporting message
        if (matchCount / keywords.length > 0.5) {
            supportingMessageIds.add(msg.id)
            if (!conversationId && msg.conversationId) {
                conversationId = msg.conversationId
            }
        }
    }

    if (supportingMessageIds.size === 0) {
        return {
            verified: false,
            reason: `Content keywords [${keywords.slice(0, 3).join(', ')}...] not found in recent history.`
        }
    }

    // 4. Construct Provenance Data
    const source: ProvenanceData = {
        conversationId: conversationId || 'unknown',
        messageIds: Array.from(supportingMessageIds),
        verifiedAt: new Date().toISOString()
    }

    return {
        verified: true,
        source
    }
}

/**
 * Extract significant keywords from text
 */
function extractKeywords(text: string): string[] {
    // English stop words (abbreviated list)
    const stopWords = new Set([
        'the', 'is', 'at', 'of', 'on', 'and', 'a', 'an', 'in', 'to', 'for',
        'with', 'by', 'but', 'or', 'so', 'it', 'this', 'that', 'from', 'be',
        'are', 'was', 'were', 'has', 'have', 'had', 'as', 'if', 'not'
    ])

    return text.toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter(w => w.length > 2 && !stopWords.has(w))
}
