import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, providerCredentials, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { getMessageCount, getMessagesForSummarization, archiveMessages, saveMemorySummary } from '@/lib/chorum/memory'
import { buildSummarizationPrompt } from '@/lib/chorum/summarize'
import { callProvider } from '@/lib/providers'
import { getCheapModel, BACKGROUND_PROVIDER_PREFERENCE } from '@/lib/providers/registry'

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

        let selectedProvider: { provider: string, apiKey: string, model: string, baseUrl?: string, isLocal?: boolean } | undefined

        // Helper
        const findProvider = (providerName: string) => {
            const cred = creds.find(c => c.provider === providerName)
            if (!cred) return undefined
            return {
                provider: cred.provider,
                apiKey: decrypt(cred.apiKeyEncrypted),
                model: getCheapModel(cred.provider),
                baseUrl: cred.baseUrl || undefined,
                isLocal: cred.isLocal || false
            }
        }

        // 1. Try credentials in preference order
        for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
            const result = findProvider(provider)
            if (result) {
                selectedProvider = result
                break
            }
        }

        // 2. Fallback to Env vars
        if (!selectedProvider) {
            for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
                const envKey = `${provider.toUpperCase()}_API_KEY`
                const apiKey = process.env[envKey] || (provider === 'google' ? process.env.GOOGLE_AI_API_KEY : undefined)
                if (apiKey) {
                    selectedProvider = {
                        provider,
                        apiKey,
                        model: getCheapModel(provider)
                    }
                    break
                }
            }
        }

        if (!selectedProvider) {
            return NextResponse.json({
                error: 'No providers configured. Add API keys in Settings.'
            }, { status: 400 })
        }

        // Format messages for summarization
        const formatted = oldMessages.map(m => `${m.role}: ${m.content}`).join('\n\n')
        const prompt = buildSummarizationPrompt(formatted)

        // Generate summary
        const result = await callProvider(
            {
                provider: selectedProvider.provider,
                apiKey: selectedProvider.apiKey,
                model: selectedProvider.model,
                baseUrl: selectedProvider.baseUrl,
                isLocal: selectedProvider.isLocal
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
            provider: selectedProvider.provider
        })

    } catch (error: any) {
        console.error('Summarization error:', error)
        return NextResponse.json({
            error: `Failed to summarize: ${error.message}`
        }, { status: 500 })
    }
}
