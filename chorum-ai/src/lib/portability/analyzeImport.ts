import { queueBatchForLearning } from '@/lib/learning/queue'
import { detectDomainsFromText, type DomainSignal, type DomainScore } from '@/lib/chorum/domainSignal'
import type { FullProviderConfig } from '@/lib/providers'
import type { NormalizedConversation } from './parsers'

export interface ImportAnalysisResult {
    conversationsProcessed: number
    conversationsSkipped: number
    learningsStored: number
    duplicatesFound: number
    learningsMerged: number
    errors: string[]
    domainSignal: DomainSignal
    batchId?: string
    queued?: number
}

export interface ImportAnalysisOptions {
    projectId: string
    providerConfig: FullProviderConfig
    userId: string
    maxConversations?: number
    minMessages?: number
    rateLimitMs?: number
    focusDomains?: string[]
}

function normalizeDomainSignal(conversations: NormalizedConversation[]): DomainSignal {
    const messages = conversations.flatMap(c => c.messages)
    if (messages.length === 0) {
        return {
            primary: 'general',
            domains: [],
            conversationsAnalyzed: 0,
            computedAt: new Date()
        }
    }

    const domainAccumulator: Record<string, { totalConfidence: number; evidence: number }> = {}

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const scores = detectDomainsFromText(msg.content)
        const recencyWeight = 1.0 - (i / messages.length) * 0.7

        for (const score of scores) {
            if (!domainAccumulator[score.domain]) {
                domainAccumulator[score.domain] = { totalConfidence: 0, evidence: 0 }
            }
            domainAccumulator[score.domain].totalConfidence += score.confidence * recencyWeight
            domainAccumulator[score.domain].evidence += score.evidence
        }
    }

    const maxTotal = Math.max(
        ...Object.values(domainAccumulator).map(d => d.totalConfidence),
        1
    )

    const domains: DomainScore[] = Object.entries(domainAccumulator)
        .map(([domain, acc]) => ({
            domain,
            confidence: Math.round((acc.totalConfidence / maxTotal) * 100) / 100,
            evidence: acc.evidence
        }))
        .filter(d => d.confidence >= 0.10)
        .sort((a, b) => b.confidence - a.confidence)

    return {
        primary: domains.length > 0 ? domains[0].domain : 'general',
        domains,
        conversationsAnalyzed: conversations.length,
        computedAt: new Date()
    }
}

function buildConversationPairs(messages: { role: string; content: string }[]): { user: string; assistant: string }[] {
    const pairs: { user: string; assistant: string }[] = []
    let currentUser = ''
    let currentAssistant = ''

    for (const msg of messages) {
        if (msg.role === 'user') {
            if (currentUser && currentAssistant) {
                pairs.push({ user: currentUser, assistant: currentAssistant })
                currentUser = ''
                currentAssistant = ''
            }
            currentUser += (currentUser ? '\n' : '') + msg.content
        } else if (msg.role === 'assistant') {
            currentAssistant += (currentAssistant ? '\n' : '') + msg.content
        }
    }

    if (currentUser && currentAssistant) {
        pairs.push({ user: currentUser, assistant: currentAssistant })
    }

    return pairs
}

export async function analyzeImportedConversations(
    conversations: NormalizedConversation[],
    options: ImportAnalysisOptions
): Promise<ImportAnalysisResult> {
    const maxConversations = options.maxConversations ?? conversations.length
    const minMessages = options.minMessages ?? 2

    // Filter and select conversations
    const selected = conversations.slice(0, maxConversations)
    const domainSignal = normalizeDomainSignal(selected)

    let conversationsSkipped = 0
    const allPairs: Array<{ userMessage: string; assistantResponse: string }> = []

    // Build learning pairs from all conversations
    for (const conversation of selected) {
        const eligibleMessages = conversation.messages.filter(m => m.role === 'user' || m.role === 'assistant')
        if (eligibleMessages.length < minMessages) {
            conversationsSkipped++
            continue
        }

        const pairs = buildConversationPairs(eligibleMessages)
        if (pairs.length === 0) {
            conversationsSkipped++
            continue
        }

        // Chunk large conversations to avoid context limits
        // A single 3k line conversation will blow up the context window if sent as one blob.
        // We use a sliding window of 3 turns to maintain local context.
        const WINDOW_SIZE = 3

        for (let i = 0; i < pairs.length; i += WINDOW_SIZE) {
            const window = pairs.slice(i, i + WINDOW_SIZE)
            const userContent = window.map(p => p.user).join('\n\n---\n\n')
            const assistantContent = window.map(p => p.assistant).join('\n\n---\n\n')

            allPairs.push({
                userMessage: userContent,
                assistantResponse: assistantContent
            })
        }
    }

    // Queue for async processing
    let batchId: string | undefined
    let queued = 0

    if (allPairs.length > 0) {
        const batchLabel = `Import analysis (${allPairs.length} conversations)`
        const result = await queueBatchForLearning(
            options.projectId,
            options.userId,
            allPairs,
            batchLabel,
            'Import:Universal'
        )
        batchId = result.batchId
        queued = result.queued
    }

    return {
        conversationsProcessed: allPairs.length,
        conversationsSkipped,
        learningsStored: 0, // Will be populated asynchronously
        duplicatesFound: 0,
        learningsMerged: 0,
        errors: [],
        domainSignal,
        batchId,
        queued
    }
}
