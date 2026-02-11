import { decrypt } from '@/lib/crypto'
import { auth, authFromRequest } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { ChorumRouter, BudgetExhaustedError } from '@/lib/chorum/router'
import { db } from '@/lib/db'
import { messages, routingLog, usageLog, providerCredentials, projects, users, conversations, projectDocuments } from '@/lib/db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getRelevantMemory, buildMemoryContext, type MemoryStrategy } from '@/lib/chorum/memory'
import { checkAndSummarize, buildSummarizationPrompt } from '@/lib/chorum/summarize'
import { generateConversationTitle } from '@/lib/chorum/title'
import { anonymizePii } from '@/lib/pii'
import { callProvider, generateImage, BACKGROUND_PROVIDER_PREFERENCE, getCheapModel, type FullProviderConfig, type ChatResult, type ToolDefinition, type ChatMessage } from '@/lib/providers'
import { getPreset } from '@/lib/providers/presets'
import { getToolsForUser, executeToolCall, type McpTool } from '@/lib/mcp-client'
import {
    callProviderWithFallback,
    buildFallbackChain,
    detectLocalProviders,
    sortByFallbackPriority
} from '@/lib/providers/fallback'
import { injectLearningContext, onInjection, type LearningContext } from '@/lib/learning/injector'
import { validateResponse } from '@/lib/learning/validator'
import { updateConfidence } from '@/lib/learning/manager'
import { validateProviderEndpoint, logLlmRequest, type SecuritySettings } from '@/lib/security'
import { selectAgent, type OrchestrationResult } from '@/lib/agents/orchestrator'
import { queueForLearning } from '@/lib/learning/queue'
import { extractAndStoreLearnings } from '@/lib/learning/analyzer'
import { analyzeProjectDomain, type StoredDomainSignal } from '@/lib/chorum/domainSignal'
import { getExperimentVariant } from '@/lib/experiments'
import { ensureUserExists } from '@/lib/user-init'
import { WEB_SEARCH_TOOL_DEFINITION, executeWebSearch, isSearchEnabled } from '@/lib/search'

// Allow large request bodies (base64-encoded images can exceed default 1MB/10MB)
export const maxDuration = 60 // seconds

export async function POST(req: NextRequest) {
    try {
        // Support both Bearer token (mobile) and session (web) auth
        let session = await authFromRequest(req)

        // [AUDIT BYPASS] Allow audit script to run without real login in dev mode
        if (!session?.user?.id && process.env.NODE_ENV !== 'production' && req.headers.get('x-audit-bypass-secret') === 'chorum-audit') {
            const devUser = await db.query.users.findFirst()
            if (devUser) {
                // Mock session for audit
                session = { user: { id: devUser.id, email: devUser.email || 'dev@example.com', name: devUser.name || 'Dev User' } } as any
            }
        }

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        // Ensure user record exists and fetch settings
        const user = await ensureUserExists(
            userId,
            session.user.email!,
            session.user.name
        )
        const userBio = user.bio
        const securitySettings = user.securitySettings
        const fallbackSettings = user.fallbackSettings
        const memorySettings = user.memorySettings || {
            autoLearn: true,
            learningMode: 'async' as const,
            injectContext: true,
            autoSummarize: true,
            validateResponses: true,
            smartAgentRouting: true
        }

        const { projectId, conversationId: existingConversationId, content: rawContent, images, attachments, providerOverride, agentOverride } = await req.json()

        let conversationId = existingConversationId
        let isNewConversation = false

        // Construct enhanced content including text attachments
        let content = rawContent

        // Append text-based attachments to the user message content
        // Handle persistent vs ephemeral attachments differently
        if (attachments && Array.isArray(attachments)) {
            const textAttachments = attachments.filter((a: any) =>
                ['text', 'code', 'markdown', 'json'].includes(a.type)
            )

            for (const att of textAttachments) {
                if (att.persistent && projectId) {
                    // Store in projectDocuments table
                    const docId = await storeProjectDocument(projectId, userId, att)
                    content += `\n\n--- Attached File: ${att.name} [doc:${docId}] ---\n${att.content}\n--- End of File ---`
                } else {
                    // Mark as ephemeral - will be excluded from learning extraction
                    content += `\n\n--- EPHEMERAL: ${att.name} ---\n${att.content}\n--- End EPHEMERAL ---`
                }
            }
        }

        // Helper function to store persistent documents
        async function storeProjectDocument(projectId: string, userId: string, att: any): Promise<string> {
            const contentHash = att.contentHash || await computeHash(att.content)

            // Check for existing document with same hash (deduplication)
            const existing = await db.query.projectDocuments.findFirst({
                where: and(
                    eq(projectDocuments.projectId, projectId),
                    eq(projectDocuments.contentHash, contentHash)
                )
            })

            if (existing) {
                console.log(`[Document] Reusing existing document ${existing.id} for ${att.name}`)
                return existing.id
            }

            // Insert new document
            const [inserted] = await db.insert(projectDocuments).values({
                projectId,
                filename: att.name,
                contentHash,
                content: att.content,
                mimeType: att.mimeType || 'text/plain',
                uploadedBy: userId,
                metadata: { originalSize: att.content.length }
            }).returning({ id: projectDocuments.id })

            console.log(`[Document] Stored new document ${inserted.id} for ${att.name}`)
            return inserted.id
        }

        // Simple hash function for deduplication
        async function computeHash(content: string): Promise<string> {
            const encoder = new TextEncoder()
            const data = encoder.encode(content)
            const hashBuffer = await crypto.subtle.digest('SHA-256', data)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        }

        // Apply PII anonymization if enabled
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
        let projectDomainSignal: StoredDomainSignal | null = null
        let projectFocusDomains: string[] = []

        // Validate projectId is a valid UUID before querying
        const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

        if (projectId && isValidUUID(projectId)) {
            const project = await db.query.projects.findFirst({
                where: and(
                    eq(projects.id, projectId),
                    eq(projects.userId, userId)
                )
            })
            projectDomainSignal = project?.domainSignal as StoredDomainSignal | null
            projectFocusDomains = project?.focusDomains ?? []
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


        // [Agent Orchestration] Select and configure agent for this request
        let agentResult: OrchestrationResult | null = null
        // Skip orchestration if user selected "none" (control mode) or smart routing disabled
        const skipAgentOrchestration = agentOverride === 'none' || memorySettings.smartAgentRouting === false
        if (!skipAgentOrchestration) {
            try {
                agentResult = await selectAgent({
                    userId,
                    prompt: content,
                    projectContext: systemPrompt,
                    preferredAgent: agentOverride
                })
                if (agentResult) {
                    // Agent system prompt includes persona, guardrails, and base context
                    systemPrompt = agentResult.systemPrompt
                    console.log(`[Agent] Selected: ${agentResult.agent.name} (${Math.round(agentResult.confidence * 100)}%)`)
                }
            } catch (e) {
                console.warn('[Agent] Orchestration failed, using default prompt:', e)
            }
        } else if (agentOverride === 'none') {
            console.log('[Agent] Skipped - user selected "none" (control mode)')
        }

        // Get conversation memory (query-aware)
        const memory = projectId
            ? await getRelevantMemory(projectId, content)
            : { summary: null, recentMessages: [], strategy: 'immediate' as MemoryStrategy, historyReferenceDetected: false }
        const memoryContext = buildMemoryContext(memory)

        // Log memory strategy for observability
        if (projectId && memory.strategy) {
            console.log(`[Memory] Strategy: ${memory.strategy}, History ref: ${memory.historyReferenceDetected}, Messages: ${memory.recentMessages.length}`)
        }

        // [Learning System] Injection moved to after routing decision to use contextWindow
        let learningContext: LearningContext | null = null

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
                    provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY,
                    capabilities: ['deep_reasoning', 'code_generation'], costPer1M: { input: 3, output: 15 }, dailyBudget: 10, spentToday: 0,
                    securitySettings: securitySettings || undefined,
                    contextWindow: 200000
                })
            }
            if (process.env.OPENAI_API_KEY) {
                providerConfigs.push({
                    provider: 'openai', model: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY,
                    capabilities: ['code_generation', 'general'], costPer1M: { input: 10, output: 30 }, dailyBudget: 10, spentToday: 0,
                    securitySettings: securitySettings || undefined,
                    contextWindow: 128000
                })
            }
            if (process.env.GOOGLE_AI_API_KEY) {
                providerConfigs.push({
                    provider: 'google', model: 'gemini-1.5-pro', apiKey: process.env.GOOGLE_AI_API_KEY,
                    capabilities: ['cost_efficient', 'long_context'], costPer1M: { input: 3.5, output: 10.5 }, dailyBudget: 5, spentToday: 0,
                    securitySettings: securitySettings || undefined,
                    contextWindow: 1000000
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
                displayName: c.displayName || undefined,
                // Pass security settings for SSL/TLS configuration
                securitySettings: securitySettings || undefined,
                contextWindow: c.contextWindow || getPreset(c.provider)?.contextWindow || 128000
            }))
        }

        if (providerConfigs.length === 0) {
            return NextResponse.json({ error: 'No providers configured. Add API keys in Settings.' }, { status: 400 })
        }

        const router = new ChorumRouter(providerConfigs)
        const routingStrategy = getExperimentVariant(userId, 'routing_strategy_v2')

        let decision: any;
        try {
            decision = await router.route({
                prompt: content,
                userOverride: providerOverride,
            })
            console.log(`[Router] Decision: ${decision.provider} (${decision.model}) Task: ${decision.taskType} \nReasoning: ${decision.reasoning}`)
        } catch (error: any) {
            // If budget exhausted, check for local fallback options before giving up
            if (error.name === 'BudgetExhaustedError') {
                const detected = await detectLocalProviders()
                const hasLocal = (detected.ollama.available && detected.ollama.models.length > 0) ||
                    (detected.lmstudio.available && detected.lmstudio.models.length > 0)

                if (hasLocal) {
                    console.log('[Router] Cloud budget exhausted, falling back to local providers')
                    // Mock a decision to allow fallback logic to proceed
                    decision = {
                        provider: 'budget_exhausted', // Placeholder to trigger fallback
                        model: 'fallback',
                        reasoning: 'Cloud budget exhausted',
                        estimatedCost: 0,
                        alternatives: [],
                        contextWindow: 8000,
                        taskType: 'general'
                    }


                } else {
                    throw error
                }
            } else {
                throw error
            }
        }

        // [Learning System] Relevance Gating Injection
        // Now using the decided context window to select the right tier
        if (projectId && decision) {
            // Use conversation depth from memory context
            const depth = memory.recentMessages.length + (existingConversationId ? 10 : 0)

            learningContext = await injectLearningContext(
                systemPrompt,
                projectId,
                content,
                userId, // Pass userId for cache recompilation
                memory.recentMessages.length,
                decision.contextWindow // Pass the routing decision's context window
            )
            systemPrompt = learningContext.systemPrompt

            if (learningContext.relevance) {
                console.log(`[Relevance] ${learningContext.relevance.complexity} query → Injected ${learningContext.relevance.itemsSelected} items (${learningContext.relevance.latencyMs}ms)`)
            }
        }

        // Create new conversation if needed
        if (!conversationId && projectId) {
            try {
                const [newConversation] = await db.insert(conversations).values({
                    projectId,
                    title: null // Will be generated async after first response
                }).returning()
                conversationId = newConversation.id
                isNewConversation = true
                console.log(`[Conversation] Created new conversation: ${conversationId}`)
            } catch (e) {
                console.warn('Failed to create conversation:', e)
            }
        }

        // Save user message
        try {
            await db.insert(messages).values({
                projectId,
                conversationId,
                role: 'user',
                content,
                images, // Save base64 images in DB (Legacy)
                attachments // Save full attachment objects
            })
        } catch (e) {
            console.warn('Failed to save user message to DB', e)
        }

        // Build full message array with memory
        let fullMessages: ChatMessage[] = [
            ...memoryContext,
            { role: 'user' as const, content, images }
        ]

        // [MCP Tools] Fetch available tools from external MCP servers
        let mcpTools: McpTool[] = []
        let toolDefinitions: ToolDefinition[] = []
        try {
            mcpTools = await getToolsForUser(userId)

            // [Search] Inject native search tool if enabled
            if (await isSearchEnabled(userId)) {
                // We treat it compatible with McpTool interface for the definition part
                mcpTools.push({
                    ...WEB_SEARCH_TOOL_DEFINITION,
                    serverId: 'native-search',
                    serverName: 'Chorum Search'
                })
            }

            toolDefinitions = mcpTools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema
            }))
            if (toolDefinitions.length > 0) {
                console.log(`[MCP] ${toolDefinitions.length} tools available: ${toolDefinitions.map(t => t.name).join(', ')}`)
            }
        } catch (e) {
            console.warn('[MCP] Failed to fetch tools:', e)
        }

        let response: string
        let tokensInput: number = 0
        let tokensOutput: number = 0
        let actualProvider: string = decision.provider
        let wasFallback: boolean = false
        let failedProviders: { provider: string; error: string }[] = []
        let result: ChatResult
        let toolsUsed: { name: string; serverId: string }[] = []

        try {
            // Find the selected provider config (might be undefined if budget exhausted placeholder)
            const selectedConfig = providerConfigs.find(p => p.provider === decision.provider)
            // Only throw if NOT falling back from budget exhaustion
            if (!selectedConfig && decision.provider !== 'budget_exhausted') {
                throw new Error(`Provider ${decision.provider} not found in configs`)
            }

            // [Security] Validate provider endpoint URL if HTTPS enforcement is enabled
            if (selectedConfig) {
                const httpsValidation = validateProviderEndpoint(
                    selectedConfig.baseUrl,
                    selectedConfig.provider,
                    securitySettings as SecuritySettings | null
                )
                if (!httpsValidation.valid) {
)
        }

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
            }

            // Check if fallback is enabled (default: true)
            // Force fallback if budget exhausted
            const fallbackEnabled = fallbackSettings?.enabled !== false || decision.provider === 'budget_exhausted'

            if (decision.taskType === 'image_generation') {
                const selectedConfig = providerConfigs.find(p => p.provider === decision.provider)
                if (!selectedConfig) {
                    throw new Error(`Provider ${decision.provider} not found in configs`)
                }

                result = await generateImage(
                    {
                        provider: selectedConfig.provider,
                        apiKey: selectedConfig.apiKey,
                        model: decision.model,
                        baseUrl: selectedConfig.baseUrl,
                        isLocal: selectedConfig.isLocal,
                        securitySettings: selectedConfig.securitySettings,
                    },
                    content
                )
            } else if (fallbackEnabled && (providerConfigs.length > 1 || decision.provider === 'budget_exhausted')) {
                // Build fallback chain with alternatives from routing decision
                const alternativeConfigs = decision.alternatives
                    .map((alt: any) => providerConfigs.find(p => p.provider === alt.provider))
                    .filter((c: any): c is FullProviderConfig => !!c)

                // Check for local providers as last resort
                const localProviders: { ollama?: string; lmstudio?: string } = {}

                // Only attempt local provider detection when NOT on Vercel/production
                // Vercel sets VERCEL=1 or VERCEL_ENV; we also check for NODE_ENV=production
                const isOnVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production'

                if (!isOnVercel) {
                    if (fallbackSettings?.localFallbackModel) {
                        localProviders.ollama = fallbackSettings.localFallbackModel
                    } else {
                        // Auto-detect local providers (only in local dev environment)
                        const detected = await detectLocalProviders()
                        if (detected.ollama.available && detected.ollama.models.length > 0) {
                            localProviders.ollama = detected.ollama.models[0]
                        }
                        if (detected.lmstudio.available && detected.lmstudio.models.length > 0) {
                            localProviders.lmstudio = detected.lmstudio.models[0]
                        }
                    }
                }

                const fallbackConfig = buildFallbackChain(
                    providerConfigs as FullProviderConfig[],
                    // If budget exhausted, use a dummy primary and rely on local fallbacks.
                    // buildFallbackChain requires a primary provider.
                    // If budget exhausted, we'll pick the first available provider as a placeholder.
                    decision.provider === 'budget_exhausted' ? providerConfigs[0]?.provider : decision.provider,
                    localProviders
                )

                // If budget exhausted, ensure we DON'T try the cloud providers that are out of budget?
                // The router already filtered them out. So alternativeConfigs might be empty.
                // We just rely on localFallbacks being present in fallbackConfig.

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

                // Add MCP tools to fallback config
                if (toolDefinitions.length > 0) {
                    fallbackConfig.tools = toolDefinitions
                    fallbackConfig.toolChoice = 'auto'
                }

                // Fallback call
                result = await callProviderWithFallback(
                    fallbackConfig,
                    fullMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                        images: m.images,
                        attachments: (m as any).attachments,
                        toolCalls: m.toolCalls,
                        toolResults: m.toolResults
                    })),
                    systemPrompt
                )
            } else {
                // Direct call (no fallback needed or available)
                if (!selectedConfig) {
                    throw new Error(`Provider ${decision.provider} not found in configs`)
                }

                result = await callProvider(
                    {
                        provider: selectedConfig.provider,
                        apiKey: selectedConfig.apiKey,
                        model: decision.model,
                        baseUrl: selectedConfig.baseUrl,
                        isLocal: selectedConfig.isLocal,
                        securitySettings: selectedConfig.securitySettings,
                        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                        toolChoice: toolDefinitions.length > 0 ? 'auto' : undefined
                    },
                    fullMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                        images: m.images,
                        attachments: (m as any).attachments,
                        toolCalls: m.toolCalls,
                        toolResults: m.toolResults
                    })),
                    systemPrompt
                )
            }

            // [MCP Tool Execution Loop]
            // If the model wants to use tools, execute them and continue the conversation
            const MAX_TOOL_ITERATIONS = 10
            let toolIteration = 0

            while (result.stopReason === 'tool_use' && result.toolCalls && result.toolCalls.length > 0 && toolIteration < MAX_TOOL_ITERATIONS) {
                toolIteration++
                console.log(`[MCP] Tool iteration ${toolIteration}: ${result.toolCalls.map(tc => tc.name).join(', ')}`)

                // Execute each tool call
                const toolResults: { toolCallId: string; content: string; isError?: boolean }[] = []

                for (const toolCall of result.toolCalls) {
                    const mcpTool = mcpTools.find(t => t.name === toolCall.name)
                    if (mcpTool) {
                        toolsUsed.push({ name: toolCall.name, serverId: mcpTool.serverId })
                    }

                    try {
                        console.log(`[MCP] Executing tool: ${toolCall.name}`)

                        let toolResult;

                        // Handle Native Search Tool
                        if (toolCall.name === WEB_SEARCH_TOOL_DEFINITION.name) {
                            toolResult = await executeWebSearch(
                                userId,
                                toolCall.arguments as { query: string; num_results?: number }
                            )
                        } else {
                            // Handle External MCP Tools
                            toolResult = await executeToolCall(userId, toolCall.name, toolCall.arguments)
                        }

                        const resultContent = toolResult.content
                            .filter(c => c.type === 'text' && c.text)
                            .map(c => c.text)
                            .join('\n')

                        toolResults.push({
                            toolCallId: toolCall.id,
                            content: resultContent || 'Tool executed successfully (no output)',
                            isError: toolResult.isError
                        })

                        if (toolResult.isError) {
                            console.warn(`[MCP] Tool ${toolCall.name} returned error:`, resultContent)
                        }
                    } catch (error) {
                        console.error(`[MCP] Tool ${toolCall.name} failed:`, error)
                        toolResults.push({
                            toolCallId: toolCall.id,
                            content: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            isError: true
                        })
                    }
                }

                // Add tool interaction to messages
                fullMessages.push({
                    role: 'assistant',
                    content: result.content || '',
                    toolCalls: result.toolCalls
                })
                fullMessages.push({
                    role: 'user',
                    content: '',
                    toolResults: toolResults
                })

                // Accumulate tokens from tool iterations
                tokensInput += result.tokensInput
                tokensOutput += result.tokensOutput

                // Continue conversation with tool results
                const selectedConfig = providerConfigs.find(p => p.provider === decision.provider)
                if (!selectedConfig) {
                    throw new Error(`Provider ${decision.provider} not found for tool continuation`)
                }

                result = await callProvider(
                    {
                        provider: selectedConfig.provider,
                        apiKey: selectedConfig.apiKey,
                        model: decision.model,
                        baseUrl: selectedConfig.baseUrl,
                        isLocal: selectedConfig.isLocal,
                        securitySettings: selectedConfig.securitySettings,
                        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                        toolChoice: toolDefinitions.length > 0 ? 'auto' : undefined
                    },
                    fullMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                        images: m.images,
                        attachments: (m as any).attachments,
                        toolCalls: m.toolCalls,
                        toolResults: m.toolResults
                    })),
                    systemPrompt
                )
            }

            if (toolIteration >= MAX_TOOL_ITERATIONS) {
                console.warn(`[MCP] Reached max tool iterations (${MAX_TOOL_ITERATIONS})`)
            }

            response = result.content
            tokensInput += result.tokensInput
            tokensOutput += result.tokensOutput
        } catch (err: any) {
            console.error('Provider error:', err)
)
        }

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

                // [Co-occurrence Tracking] Track injected items
                // Fire and forget to avoid latency
                if (learningContext.injectedItems && learningContext.injectedItems.length > 1) {
                    onInjection(
                        learningContext.injectedItems as any,
                        projectId,
                        validation.isValid ? 'positive' : 'neutral'
                    ).catch(e => console.warn('[Learning] Co-occurrence tracking failed:', e))
                }
            } catch (e) {
                console.warn('[Learning] Validation failed:', e)
            }
        }

        // Use actual provider for cost calculation (may differ if fallback occurred)
        // FIX: Handle undefined usedProviderConfig for local fallback
        const usedProviderConfig = providerConfigs.find(p => p.provider === actualProvider) ||
            providerConfigs.find(p => p.provider === decision.provider)

        // If not found in config (e.g. local provider not in DB), assume 0 cost or default
        const costInput = usedProviderConfig ? usedProviderConfig.costPer1M.input : 0
        const costOutput = usedProviderConfig ? usedProviderConfig.costPer1M.output : 0

        const actualCost = (
            (tokensInput / 1_000_000 * costInput) +
            (tokensOutput / 1_000_000 * costOutput)
        )

        const assistantMsgId = uuidv4()

        // Save to DB
        try {
            await db.insert(messages).values({
                id: assistantMsgId,
                projectId,
                conversationId,
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
            // Use waitUntil to prevent Vercel from killing the connection before completion
            if (projectId) {
                waitUntil(
                    checkAndSummarize(projectId, async (conversationText) => {
                        // Use explicit provider cascade for background tasks
                        // Preference: Gemini Flash → GPT-4o-mini → DeepSeek → Claude Haiku → Mistral
                        const cloudProviders = providerConfigs.filter(p => !p.isLocal)

                        let selectedProvider: typeof cloudProviders[0] | undefined
                        for (const preferredProvider of BACKGROUND_PROVIDER_PREFERENCE) {
                            selectedProvider = cloudProviders.find(p => p.provider === preferredProvider)
                            if (selectedProvider) break
                        }

                        if (!selectedProvider) {
                            throw new Error('No cloud providers available for summarization')
                        }

                        const prompt = buildSummarizationPrompt(conversationText)

                        // Use provider factory with cheap model for summarization
                        const result = await callProvider(
                            {
                                provider: selectedProvider.provider,
                                apiKey: selectedProvider.apiKey,
                                model: getCheapModel(selectedProvider.provider),
                                baseUrl: selectedProvider.baseUrl,
                                isLocal: false
                            },
                            [{ role: 'user', content: prompt }],
                            'You are a helpful assistant that summarizes conversations.'
                        )
                        return result.content
                    }).catch(err => console.warn('Summarization failed:', err))
                )
            }

            // [Conversation Title] Generate title for new conversations (async)
            // Use waitUntil to prevent Vercel from killing the connection before completion
            if (isNewConversation && conversationId) {
                // Use explicit provider cascade for title generation
                const cloudProviders = providerConfigs.filter(p => !p.isLocal)

                let selectedProvider: typeof cloudProviders[0] | undefined
                for (const preferredProvider of BACKGROUND_PROVIDER_PREFERENCE) {
                    selectedProvider = cloudProviders.find(p => p.provider === preferredProvider)
                    if (selectedProvider) break
                }

                if (!selectedProvider) {
                    console.warn('[Conversation] No cloud providers available for title generation')
                } else {
                    waitUntil(
                        generateConversationTitle(content, {
                            provider: selectedProvider.provider,
                            apiKey: selectedProvider.apiKey,
                            model: getCheapModel(selectedProvider.provider),
                            baseUrl: selectedProvider.baseUrl,
                            isLocal: false
                        }).then(async (title) => {
                            try {
                                await db.update(conversations)
                                    .set({ title, updatedAt: new Date() })
                                    .where(eq(conversations.id, conversationId))
                                console.log(`[Conversation] Title generated: "${title}"`)
                            } catch (e) {
                                console.warn('[Conversation] Failed to save title:', e)
                            }
                        }).catch(err => console.warn('[Conversation] Title generation failed:', err))
                    )
                }
            }
        } catch (e) {
            console.warn('Failed to log to DB', e)
        }

        // [Semantic Memory Writer] Queue learning extraction if enabled
        if (memorySettings.autoLearn && projectId) {
            try {
                // Exclude ephemeral file content from learning extraction
                // Replace ephemeral blocks with placeholder to prevent knowledge pollution
                // Use [\s\S] instead of . with 's' flag for cross-line matching
                const contentForLearning = content.replace(
                    /--- EPHEMERAL:[\s\S]*?--- End EPHEMERAL ---/g,
                    '[Ephemeral file excluded from learning]'
                )

                if (memorySettings.learningMode === 'sync') {
                    // Synchronous processing - adds latency but immediate learning
                    const cheapestProvider = providerConfigs.sort((a, b) =>
                        (a.costPer1M?.input || 0) - (b.costPer1M?.input || 0)
                    )[0]
                    if (cheapestProvider) {
                        await extractAndStoreLearnings(
                            projectId,
                            contentForLearning,
                            response,
                            {
                                provider: cheapestProvider.provider,
                                apiKey: cheapestProvider.apiKey,
                                model: cheapestProvider.model,
                                baseUrl: cheapestProvider.baseUrl,
                                isLocal: cheapestProvider.isLocal || false
                            },
                            systemPrompt,
                            assistantMsgId,
                            session?.user?.id,
                            projectDomainSignal,
                            projectFocusDomains
                        )
                    }
                } else {
                    // Async processing - queue for background extraction
                    await queueForLearning(
                        projectId,
                        userId,
                        contentForLearning,
                        response,
                        agentResult?.agent.name
                    )
                }
            } catch (e) {
                console.warn('[Learning] Failed to queue learning:', e)
            }
        }
)
        })
        }
        // [Domain Signal] Recompute periodically (fire-and-forget)
        if (projectId) {
            waitUntil(
                (async () => {
                    const [{ count }] = await db
                        .select({ count: sql<number>count(*) })
                        .from(messages)
                        .where(eq(messages.projectId, projectId))

                    const messageCount = Number(count || 0)
                    if (messageCount > 0 && messageCount % 20 === 0) {
                        await analyzeProjectDomain(projectId)
                    }
                })().catch(err => console.error('[DomainSignal] Recomputation failed:', err))
            )
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
            agent: agentResult ? {
                id: agentResult.agent.id,
                name: agentResult.agent.name,
                icon: agentResult.agent.icon,
                tier: agentResult.agent.tier,
                confidence: agentResult.confidence,
                reasoning: agentResult.reasoning
            } : null,
            fallback: wasFallback ? {
                originalProvider: decision.provider,
                usedProvider: actualProvider,
                failedProviders
            } : null,
            validation: validationResult,
            memory: {
                hasSummary: !!memory.summary,
                strategy: memory.strategy,
                historyReferenceDetected: memory.historyReferenceDetected,
                messageCount: memory.recentMessages.length
            },
            conversation: {
                id: conversationId,
                isNew: isNewConversation
            },
            piiAnonymized: piiDetected,
            tools: toolsUsed.length > 0 ? {
                used: toolsUsed,
                availableCount: toolDefinitions.length
            } : null,
            search: toolsUsed.some(t => t.name === WEB_SEARCH_TOOL_DEFINITION.name) ? {
                executed: true,
                count: toolsUsed.filter(t => t.name === WEB_SEARCH_TOOL_DEFINITION.name).length
            } : null
        })

    } catch (error: unknown) {
        console.error('Chat error:', error)
        // Return structured error info if available, otherwise generic
        const errorMessage = error instanceof Error ? error.message : String(error)
        // If Postgres invalid input syntax for type uuid
        if (errorMessage.includes('invalid input syntax for type uuid')) {
)
        }

        return NextResponse.json({ error: 'Invalid Project ID format' }, { status: 400 })
        }
)
        }

        return NextResponse.json({ error: `Failed to process message: ${errorMessage}` }, { status: 500 })
    }
}







