import { getMessagesForSummarization, archiveMessages, saveMemorySummary, getMessageCount } from './memory'

const SUMMARIZE_THRESHOLD = 20

/**
 * Check if summarization is needed and perform it
 * Should be called after each message is added
 */
export async function checkAndSummarize(
    projectId: string,
    summarizeWithLLM: (messages: string) => Promise<string>
): Promise<boolean> {
    const count = await getMessageCount(projectId)

    // Only summarize if we have more than threshold
    if (count <= SUMMARIZE_THRESHOLD) {
        return false
    }

    // Get oldest messages to summarize (keep recent 10)
    const toSummarize = count - 10
    const oldMessages = await getMessagesForSummarization(projectId, toSummarize)

    if (oldMessages.length < 5) {
        return false // Not enough to bother summarizing
    }

    // Format messages for summarization
    const formatted = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')

    // Generate summary using provided LLM function
    const summary = await summarizeWithLLM(formatted)

    // Save summary
    const fromDate = oldMessages[0].createdAt || new Date()
    const toDate = oldMessages[oldMessages.length - 1].createdAt || new Date()

    await saveMemorySummary(
        projectId,
        summary,
        oldMessages.length,
        fromDate,
        toDate
    )

    // Archive the summarized messages
    await archiveMessages(oldMessages.map(m => m.id))

    return true
}

/**
 * Build a summarization prompt
 */
export function buildSummarizationPrompt(conversation: string): string {
    return `Summarize the following conversation in 2-3 concise paragraphs. Focus on:
1. Key topics discussed
2. Important decisions or conclusions
3. Any pending questions or action items

Conversation:
${conversation}

Summary:`
}
