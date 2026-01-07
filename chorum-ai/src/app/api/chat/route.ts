import { decrypt } from '@/lib/crypto'
import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { ChorumRouter } from '@/lib/chorum/router'
import { db } from '@/lib/db'
import { messages, routingLog, usageLog, providerCredentials, projects, users } from '@/lib/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getConversationMemory, buildMemoryContext } from '@/lib/chorum/memory'
import { checkAndSummarize, buildSummarizationPrompt } from '@/lib/chorum/summarize'
import { anonymizePii } from '@/lib/pii'
import { callProvider, type FullProviderConfig } from '@/lib/providers'
import {
    callProviderWithFallback,
    buildFallbackChain,
    detectLocalProviders,
    sortByFallbackPriority
} from '@/lib/providers/fallback'
import { injectLearningContext, type LearningContext } from '@/lib/learning/injector'
import { validateResponse } from '@/lib/learning/validator'
import { updateConfidence } from '@/lib/learning/manager'
import { validateProviderEndpoint, logLlmRequest, type SecuritySettings } from '@/lib/security'

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        // Fetch user settings (bio, security settings, fallback settings)
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        const userBio = user?.bio
        const securitySettings = user?.securitySettings
        const fallbackSettings = user?.fallbackSettings

        const { projectId, content: rawContent, providerOverride } = await req.json()

        // Apply PII anonymization if enabled
        let content = rawContent
        let piiDetected = false
        if (securitySettings?.anonymizePii) {
            const piiResult = anonymizePii(rawContent)
            if (piiResult.wasModified) {
                content = piiResult.text
                piiDetected = true
                console.log(`[PII] Anonymized ${piiResult.matches.length} item(s):`,
                    piiResult.matches.map(m => m.type).join(', '))
            }
        }

        // Fetch project context
        let systemPrompt = 'You are a helpful AI assistant.'

        // Validate projectId is a valid UUID before querying
        const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

        if (projectId && isValidUUID(projectId)) {
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

        // Inject user bio/profile into system prompt for personalization
        if (userBio && userBio.trim()) {
            systemPrompt += `\n\n## About the User\n${userBio.trim()}`
        }

        // [Learning System] Inject Patterns, Invariants, and Critical File context
        // Returns cached data to avoid double DB call during validation
        let learningContext: LearningContext | null = null
        if (projectId) {
            learningContext = await injectLearningContext(systemPrompt, projectId)
            systemPrompt = learningContext.systemPrompt
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
                provider: c.provider,
                model: c.model,
                apiKey: decrypt(c.apiKeyEncrypted),
                capabilities: c.capabilities || [],
                costPer1M: c.costPer1M || { input: 0, output: 0 },
                dailyBudget: Number(c.dailyBudget) || 10,
                spentToday: spendByProvider[c.provider] || 0,
                baseUrl: c.baseUrl || undefined,
                isLocal: c.isLocal || false,
                displayName: c.displayName || undefined
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
        let actualProvider: string = decision.provider
        let wasFallback: boolean = false
        let failedProviders: { provider: string; error: string }[] = []

        try {
            // Find the selected provider config
            const selectedConfig = providerConfigs.find(p => p.provider === decision.provider)
            if (!selectedConfig) {
                throw new Error(`Provider ${decision.provider} not found in configs`)
            }

            // [Security] Validate provider endpoint URL if HTTPS enforcement is enabled
            const httpsValidation = validateProviderEndpoint(
                selectedConfig.baseUrl,
                selectedConfig.provider,
                securitySettings as SecuritySettings | null
            )
            if (!httpsValidation.valid) {
                return NextResponse.json({
                    error: `Security violation: ${httpsValidation.error}`,
                    securityError: true
                }, { status: 403 })
            }

            // [Security] Log LLM request if audit logging is enabled
            logLlmRequest(
                userId,
                selectedConfig.provider,
                selectedConfig.baseUrl || 'default',
                securitySettings as SecuritySettings | null,
                { model: decision.model, projectId }
            )

            // Check if fallback is enabled (default: true)
            const fallbackEnabled = fallbackSettings?.enabled !== false

            if (fallbackEnabled && providerConfigs.length > 1) {
                // Build fallback chain with alternatives from routing decision
                const alternativeConfigs = decision.alternatives
                    .map(alt => providerConfigs.find(p => p.provider === alt.provider))
                    .filter((c): c is FullProviderConfig => !!c)

                // Check for local providers as last resort
                const localProviders: { ollama?: string; lmstudio?: string } = {}
                if (fallbackSettings?.localFallbackModel) {
                    localProviders.ollama = fallbackSettings.localFallbackModel
                } else {
                    // Auto-detect local providers
                    const detected = await detectLocalProviders()
                    if (detected.ollama.available && detected.ollama.models.length > 0) {
                        localProviders.ollama = detected.ollama.models[0]
                    }
                    if (detected.lmstudio.available && detected.lmstudio.models.length > 0) {
                        localProviders.lmstudio = detected.lmstudio.models[0]
                    }
                }

                const fallbackConfig = buildFallbackChain(
                    providerConfigs as FullProviderConfig[],
                    decision.provider,
                    localProviders
                )

                // Override alternatives if user has custom priority order
                if (fallbackSettings?.priorityOrder?.length) {
                    fallbackConfig.alternatives = sortByFallbackPriority(
                        providerConfigs as FullProviderConfig[]
                    ).filter(p => p.provider !== decision.provider)
                }

                // If user has a default provider preference, bump it to front of alternatives
                if (fallbackSettings?.defaultProvider &&
                    fallbackSettings.defaultProvider !== decision.provider) {
                    const defaultConfig = providerConfigs.find(
                        p => p.provider === fallbackSettings.defaultProvider
                    )
                    if (defaultConfig) {
                        fallbackConfig.alternatives = [
                            defaultConfig as FullProviderConfig,
                            ...fallbackConfig.alternatives.filter(
                                a => a.provider !== fallbackSettings.defaultProvider
                            )
                        ]
                    }
                }

                // Use fallback-aware call
                const result = await callProviderWithFallback(
                    fallbackConfig,
                    fullMessages.map(m => ({ role: m.role, content: m.content })),
                    systemPrompt
                )

                response = result.content
                tokensInput = result.tokensInput
                tokensOutput = result.tokensOutput
                actualProvider = result.usedProvider
                wasFallback = result.wasFallback
                failedProviders = result.failedProviders
            } else {
                // Fallback disabled or only one provider - direct call
                const result = await callProvider(
                    {
                        provider: selectedConfig.provider,
                        apiKey: selectedConfig.apiKey,
                        model: decision.model,
                        baseUrl: selectedConfig.baseUrl,
                        isLocal: selectedConfig.isLocal
                    },
                    fullMessages.map(m => ({ role: m.role, content: m.content })),
                    systemPrompt
                )

                response = result.content
                tokensInput = result.tokensInput
                tokensOutput = result.tokensOutput
            }
        } catch (err: any) {
            console.error('Provider error:', err)
            return NextResponse.json({
                error: `All providers failed: ${err.message}`,
                failedProviders
            }, { status: 500 })
        }

        // [Learning System] Validate Response & Update Confidence
        // Uses cached data from learningContext - no extra DB calls
        let validationResult: { isValid: boolean; violations: string[]; warnings: string[] } | null = null
        if (projectId && learningContext) {
            try {
                const validation = validateResponse(
                    response,
                    learningContext.invariants,
                    learningContext.criticalFiles
                )

                validationResult = {
                    isValid: validation.isValid,
                    violations: validation.violations,
                    warnings: validation.warnings
                }

                if (!validation.isValid) {
                    console.warn(`[Learning] Response violated invariants: ${validation.violations.join(', ')}`)
                }

                if (validation.warnings.length > 0) {
                    console.log(`[Learning] Validation warnings: ${validation.warnings.join(', ')}`)
                }

                // Update confidence score based on validation result
                await updateConfidence(projectId, validation.isValid)

            } catch (e) {
                console.warn('[Learning] Validation failed:', e)
            }
        }

        // Use actual provider for cost calculation (may differ if fallback occurred)
        const usedProviderConfig = providerConfigs.find(p => p.provider === actualProvider) ||
            providerConfigs.find(p => p.provider === decision.provider)!
        const actualCost = (
            (tokensInput / 1_000_000 * usedProviderConfig.costPer1M.input) +
            (tokensOutput / 1_000_000 * usedProviderConfig.costPer1M.output)
        )

        const assistantMsgId = uuidv4()

        // Save to DB
        try {
            await db.insert(messages).values({
                id: assistantMsgId,
                projectId,
                role: 'assistant',
                content: response,
                provider: actualProvider, // Use actual provider (may differ if fallback)
                costUsd: actualCost.toString(),
                tokensInput,
                tokensOutput
            })

            await db.insert(routingLog).values({
                userId,
                projectId,
                selectedProvider: actualProvider,
                reasoning: wasFallback
                    ? `Fallback: ${decision.reasoning} → Failed providers: ${failedProviders.map(f => f.provider).join(', ')}`
                    : decision.reasoning,
                alternatives: decision.alternatives,
                userOverride: !!providerOverride
            })

            await db.insert(usageLog).values({
                userId,
                provider: actualProvider,
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

                    // Use provider factory for summarization
                    const result = await callProvider(
                        {
                            provider: cheapestProvider.provider,
                            apiKey: cheapestProvider.apiKey,
                            model: cheapestProvider.provider === 'openai' ? 'gpt-3.5-turbo' :
                                cheapestProvider.provider === 'anthropic' ? 'claude-3-haiku-20240307' :
                                    cheapestProvider.model,
                            baseUrl: cheapestProvider.baseUrl,
                            isLocal: cheapestProvider.isLocal
                        },
                        [{ role: 'user', content: prompt }],
                        'You are a helpful assistant that summarizes conversations.'
                    )
                    return result.content
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
                provider: actualProvider,
                costUsd: actualCost.toString(),
                tokensInput,
                tokensOutput
            },
            routing: decision,
            fallback: wasFallback ? {
                originalProvider: decision.provider,
                usedProvider: actualProvider,
                failedProviders
            } : null,
            validation: validationResult,
            memoryUsed: memory.summary ? true : false,
            piiAnonymized: piiDetected
        })

    } catch (error: any) {
        console.error('Chat error:', error)
        // Return structured error info if available, otherwise generic
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        // If Postgres invalid input syntax for type uuid
        if (errorMessage.includes('invalid input syntax for type uuid')) {
            return NextResponse.json({ error: 'Invalid Project ID format' }, { status: 400 })
        }
        return NextResponse.json({ error: `Failed to process message: ${errorMessage}` }, { status: 500 })
    }
}
