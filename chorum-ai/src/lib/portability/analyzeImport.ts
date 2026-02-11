import { extractAndStoreLearnings } from '@/lib/learning/analyzer'
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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
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
    const rateLimitMs = options.rateLimitMs ?? 500
    const focusDomains = options.focusDomains ?? []
    const selected = conversations.slice(0, maxConversations)

    const domainSignal = normalizeDomainSignal(selected)
    const errors: string[] = []
    let conversationsProcessed = 0
    let conversationsSkipped = 0
    let learningsStored = 0
    let duplicatesFound = 0
    let learningsMerged = 0

    for (let index = 0; index < selected.length; index++) {
        const conversation = selected[index]
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

        try {
            for (const pair of pairs) {
                const result = await extractAndStoreLearnings(
                    options.projectId,
                    pair.user,
                    pair.assistant,
                    options.providerConfig,
                    undefined,
                    undefined,
                    options.userId,
                    domainSignal,
                    focusDomains
                )
                learningsStored += result.stored
                duplicatesFound += result.duplicates
                learningsMerged += result.merged
            }

            conversationsProcessed++
            if (conversationsProcessed % 10 === 0) {
                console.log(`[ImportAnalyze] Processed ${conversationsProcessed}/${selected.length} conversations`)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            errors.push(`Conversation ${index + 1}: ${message}`)
        }

        if (index < selected.length - 1) {
            await delay(rateLimitMs)
        }
    }

    return {
        conversationsProcessed,
        conversationsSkipped,
        learningsStored,
        duplicatesFound,
        learningsMerged,
        errors,
        domainSignal
    }
}
