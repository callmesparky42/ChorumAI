import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, providerCredentials, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { getMessageCount, getMessagesForSummarization, archiveMessages, saveMemorySummary } from '@/lib/chorum/memory'
import { buildSummarizationPrompt } from '@/lib/chorum/summarize'
import { callProvider } from '@/lib/providers'

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { projectId } = await req.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        // Verify user owns the project
        const [project] = await db.select().from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // Get message count
        const count = await getMessageCount(projectId)

        if (count < 5) {
            return NextResponse.json({
                success: false,
                message: 'Not enough messages to summarize (minimum 5)',
                messageCount: count
            })
        }

        // Get messages to summarize (keep recent 10)
        const toSummarize = Math.max(count - 10, 5)
        const oldMessages = await getMessagesForSummarization(projectId, toSummarize)

        if (oldMessages.length < 5) {
            return NextResponse.json({
                success: false,
                message: 'Not enough messages to summarize',
                messageCount: oldMessages.length
            })
        }

        // Get provider credentials for summarization
        const creds = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            )
        })

        let providerConfigs: any[] = []
        if (creds.length === 0) {
            // Use env API keys as fallback
            if (process.env.ANTHROPIC_API_KEY) {
                providerConfigs.push({
                    provider: 'anthropic',
                    model: 'claude-3-haiku-20240307',
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    costPer1M: { input: 0.25, output: 1.25 }
                })
            }
            if (process.env.OPENAI_API_KEY) {
                providerConfigs.push({
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    apiKey: process.env.OPENAI_API_KEY,
                    costPer1M: { input: 0.15, output: 0.6 }
                })
            }
        } else {
            providerConfigs = creds.map(c => ({
                provider: c.provider,
                model: c.model,
                apiKey: decrypt(c.apiKeyEncrypted),
                costPer1M: c.costPer1M || { input: 0, output: 0 },
                baseUrl: c.baseUrl || undefined,
                isLocal: c.isLocal || false
            }))
        }

        if (providerConfigs.length === 0) {
            return NextResponse.json({
                error: 'No providers configured. Add API keys in Settings.'
            }, { status: 400 })
        }

        // Use cheapest provider for summarization
        const cheapestProvider = providerConfigs.sort((a, b) =>
            (a.costPer1M.input + a.costPer1M.output) - (b.costPer1M.input + b.costPer1M.output)
        )[0]

        // Format messages for summarization
        const formatted = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')
        const prompt = buildSummarizationPrompt(formatted)

        // Generate summary
        const result = await callProvider(
            {
                provider: cheapestProvider.provider,
                apiKey: cheapestProvider.apiKey,
                model: cheapestProvider.provider === 'openai' ? 'gpt-4o-mini' :
                    cheapestProvider.provider === 'anthropic' ? 'claude-3-haiku-20240307' :
                        cheapestProvider.model,
                baseUrl: cheapestProvider.baseUrl,
                isLocal: cheapestProvider.isLocal
            },
            [{ role: 'user', content: prompt }],
            'You are a helpful assistant that summarizes conversations concisely.'
        )

        const summary = result.content

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

        return NextResponse.json({
            success: true,
            message: `Summarized ${oldMessages.length} messages`,
            summarizedCount: oldMessages.length,
            remainingCount: count - oldMessages.length,
            provider: cheapestProvider.provider
        })

    } catch (error: any) {
        console.error('Summarization error:', error)
        return NextResponse.json({
            error: `Failed to summarize: ${error.message}`
        }, { status: 500 })
    }
}
