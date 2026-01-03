import { decrypt } from '@/lib/crypto'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { ChorumRouter } from '@/lib/chorum/router'
import { db } from '@/lib/db'
import { messages, routingLog, usageLog, providerCredentials, projects } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { v4 as uuidv4 } from 'uuid'
import { getConversationMemory, buildMemoryContext } from '@/lib/chorum/memory'
import { checkAndSummarize, buildSummarizationPrompt } from '@/lib/chorum/summarize'

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { projectId, content, providerOverride } = await req.json()

        // Fetch project context
        let systemPrompt = 'You are a helpful AI assistant.'
        if (projectId) {
            const project = await db.query.projects.findFirst({
                where: and(
                    eq(projects.id, projectId),
                    eq(projects.userId, userId)
                )
            })
            if (project?.customInstructions) {
                systemPrompt = project.customInstructions
                if (project.techStack && project.techStack.length > 0) {
                    systemPrompt += `\n\nTech Stack: ${project.techStack.join(', ')}`
                }
            }
        }

        // Get conversation memory
        const memory = projectId ? await getConversationMemory(projectId) : { summary: null, recentMessages: [] }
        const memoryContext = buildMemoryContext(memory)

        // Get provider credentials
        const creds = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            )
        })

        let providerConfigs: any[] = []
        if (creds.length === 0) {
            if (process.env.ANTHROPIC_API_KEY) {
                providerConfigs.push({
                    provider: 'anthropic', model: 'claude-3-5-sonnet-20240620', apiKey: process.env.ANTHROPIC_API_KEY,
                    capabilities: ['deep_reasoning', 'code_generation'], costPer1M: { input: 3, output: 15 }, dailyBudget: 10, spentToday: 0
                })
            }
            if (process.env.OPENAI_API_KEY) {
                providerConfigs.push({
                    provider: 'openai', model: 'gpt-4-turbo', apiKey: process.env.OPENAI_API_KEY,
                    capabilities: ['code_generation', 'general'], costPer1M: { input: 10, output: 30 }, dailyBudget: 10, spentToday: 0
                })
            }
            if (process.env.GOOGLE_AI_API_KEY) {
                providerConfigs.push({
                    provider: 'google', model: 'gemini-1.5-pro', apiKey: process.env.GOOGLE_AI_API_KEY,
                    capabilities: ['cost_efficient', 'long_context'], costPer1M: { input: 3.5, output: 10.5 }, dailyBudget: 5, spentToday: 0
                })
            }
        } else {
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const todaySpend = await db.query.usageLog.findMany({
                where: and(
                    eq(usageLog.userId, userId),
                    gte(usageLog.date, today)
                )
            })

            const spendByProvider = todaySpend.reduce((acc, log) => {
                acc[log.provider] = (acc[log.provider] || 0) + Number(log.costUsd)
                return acc
            }, {} as Record<string, number>)

            providerConfigs = creds.map(c => ({
                provider: c.provider as any,
                model: c.model,
                apiKey: decrypt(c.apiKeyEncrypted),
                capabilities: c.capabilities || [],
                costPer1M: c.costPer1M || { input: 0, output: 0 },
                dailyBudget: Number(c.dailyBudget) || 10,
                spentToday: spendByProvider[c.provider] || 0
            }))
        }

        if (providerConfigs.length === 0) {
            return NextResponse.json({ error: 'No providers configured. Add API keys in Settings.' }, { status: 400 })
        }

        const router = new ChorumRouter(providerConfigs)
        const decision = await router.route({
            prompt: content,
            userOverride: providerOverride
        })

        // Save user message
        try {
            await db.insert(messages).values({
                projectId,
                role: 'user',
                content
            })
        } catch (e) {
            console.warn('Failed to save user message to DB', e)
        }

        // Build full message array with memory
        const fullMessages = [
            ...memoryContext,
            { role: 'user' as const, content }
        ]

        let response: string
        let tokensInput: number = 0
        let tokensOutput: number = 0

        try {
            if (decision.provider === 'anthropic') {
                const anthropic = new Anthropic({
                    apiKey: providerConfigs.find(p => p.provider === 'anthropic')!.apiKey
                })

                const result = await anthropic.messages.create({
                    model: decision.model,
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: fullMessages
                })

                response = result.content[0].type === 'text' ? result.content[0].text : ''
                tokensInput = result.usage.input_tokens
                tokensOutput = result.usage.output_tokens

            } else if (decision.provider === 'openai') {
                const openai = new OpenAI({
                    apiKey: providerConfigs.find(p => p.provider === 'openai')!.apiKey
                })

                const result = await openai.chat.completions.create({
                    model: decision.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...fullMessages
                    ]
                })

                response = result.choices[0].message.content || ''
                tokensInput = result.usage?.prompt_tokens || 0
                tokensOutput = result.usage?.completion_tokens || 0

            } else {
                const genAI = new GoogleGenerativeAI(
                    providerConfigs.find(p => p.provider === 'google')!.apiKey
                )
                const model = genAI.getGenerativeModel({
                    model: decision.model,
                    systemInstruction: systemPrompt
                })

                // Gemini uses different format - convert to parts
                const history = fullMessages.slice(0, -1).map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }))

                const chat = model.startChat({ history: history as any })
                const result = await chat.sendMessage(content)

                response = result.response.text()
                tokensInput = result.response.usageMetadata?.promptTokenCount || 0
                tokensOutput = result.response.usageMetadata?.candidatesTokenCount || 0
            }
        } catch (err: any) {
            console.error('Provider error:', err)
            return NextResponse.json({ error: `Provider ${decision.provider} failed: ${err.message}` }, { status: 500 })
        }

        const provider = providerConfigs.find(p => p.provider === decision.provider)!
        const actualCost = (
            (tokensInput / 1_000_000 * provider.costPer1M.input) +
            (tokensOutput / 1_000_000 * provider.costPer1M.output)
        )

        const assistantMsgId = uuidv4()

        // Save to DB
        try {
            await db.insert(messages).values({
                id: assistantMsgId,
                projectId,
                role: 'assistant',
                content: response,
                provider: decision.provider,
                costUsd: actualCost.toString(),
                tokensInput,
                tokensOutput
            })

            await db.insert(routingLog).values({
                userId,
                projectId,
                selectedProvider: decision.provider,
                reasoning: decision.reasoning,
                alternatives: decision.alternatives,
                userOverride: !!providerOverride
            })

            await db.insert(usageLog).values({
                userId,
                provider: decision.provider,
                costUsd: actualCost.toString(),
                tokensInput,
                tokensOutput
            })

            // Check if we need to summarize old messages (async, don't wait)
            if (projectId) {
                checkAndSummarize(projectId, async (conversationText) => {
                    // Use the cheapest available provider for summarization
                    const cheapestProvider = providerConfigs.sort((a, b) =>
                        (a.costPer1M.input + a.costPer1M.output) - (b.costPer1M.input + b.costPer1M.output)
                    )[0]

                    const prompt = buildSummarizationPrompt(conversationText)

                    if (cheapestProvider.provider === 'openai') {
                        const openai = new OpenAI({ apiKey: cheapestProvider.apiKey })
                        const result = await openai.chat.completions.create({
                            model: 'gpt-3.5-turbo',
                            messages: [{ role: 'user', content: prompt }],
                            max_tokens: 500
                        })
                        return result.choices[0].message.content || ''
                    } else {
                        // Default to Anthropic
                        const anthropic = new Anthropic({ apiKey: cheapestProvider.apiKey })
                        const result = await anthropic.messages.create({
                            model: 'claude-3-haiku-20240307',
                            max_tokens: 500,
                            messages: [{ role: 'user', content: prompt }]
                        })
                        return result.content[0].type === 'text' ? result.content[0].text : ''
                    }
                }).catch(err => console.warn('Summarization failed:', err))
            }
        } catch (e) {
            console.warn('Failed to log to DB', e)
        }

        return NextResponse.json({
            message: {
                id: assistantMsgId,
                role: 'assistant',
                content: response,
                provider: decision.provider,
                costUsd: actualCost.toString(),
                tokensInput,
                tokensOutput
            },
            routing: decision,
            memoryUsed: memory.summary ? true : false
        })

    } catch (error) {
        console.error('Chat error:', error)
        return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
    }
}
