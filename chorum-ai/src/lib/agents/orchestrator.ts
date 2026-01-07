/**
 * Agent Orchestrator
 * 
 * The brain of the agent system - matches user intent to the right agent,
 * manages agent selection, and coordinates handoffs.
 * 
 * This is what makes Chorum different: intelligent routing to specialized
 * AI personas that each have their own expertise, guardrails, and memory focus.
 */

import { AgentDefinition, AgentTier } from './types'
import { getAgent, listAgents, getAgentsByTier, buildAgentSystemPrompt } from './registry'
import { ChorumRouter, TaskType } from '@/lib/chorum/router'

// Task type to agent mapping - which agents are best suited for which tasks
const TASK_AGENT_MAP: Record<TaskType, string[]> = {
    'deep_reasoning': ['analyst', 'architect', 'debugger'],
    'code_generation': ['code-reviewer', 'debugger', 'architect'],
    'bulk_processing': ['summarizer', 'coordinator'],
    'structured_output': ['planner', 'analyst'],
    'vision_analysis': ['analyst', 'researcher'],
    'general': ['writer', 'researcher', 'planner']
}

// Keyword patterns for agent matching
const AGENT_KEYWORDS: Record<string, string[]> = {
    'analyst': ['analyze', 'analysis', 'compare', 'evaluate', 'tradeoff', 'pattern', 'why', 'decision'],
    'architect': ['design', 'architecture', 'system', 'structure', 'scalability', 'database', 'api'],
    'code-reviewer': ['review', 'code', 'quality', 'security', 'vulnerability', 'refactor'],
    'debugger': ['debug', 'bug', 'error', 'fix', 'broken', 'issue', 'crash', 'failing'],
    'researcher': ['research', 'find', 'search', 'explore', 'documentation', 'options'],
    'writer': ['write', 'draft', 'create', 'document', 'blog', 'article', 'readme'],
    'editor': ['edit', 'improve', 'revise', 'polish', 'proofread'],
    'planner': ['plan', 'breakdown', 'tasks', 'roadmap', 'milestone', 'schedule'],
    'summarizer': ['summarize', 'tldr', 'brief', 'condense', 'key points'],
    'translator': ['translate', 'convert', 'explain like', 'simplify'],
    'tutor': ['teach', 'explain', 'learn', 'understand', 'how does', 'what is'],
    'fact-checker': ['verify', 'fact', 'check', 'accurate', 'true', 'source'],
    'copywriter': ['marketing', 'copy', 'landing page', 'cta', 'persuade', 'sell'],
    'coordinator': ['orchestrate', 'workflow', 'sequence', 'coordinate']
}

export interface OrchestrationResult {
    agent: AgentDefinition
    confidence: number
    reasoning: string
    systemPrompt: string
    modelOverrides: {
        temperature?: number
        maxTokens?: number
    }
    alternativeAgents: { agent: string; confidence: number }[]
}

export interface OrchestrationRequest {
    prompt: string
    taskType?: TaskType
    preferredAgent?: string
    projectContext?: string
    tier?: AgentTier
}

/**
 * Select the best agent for a given request
 * 
 * This is the core intelligence that makes Chorum valuable - 
 * matching user intent to specialized AI expertise.
 */
export async function selectAgent(request: OrchestrationRequest): Promise<OrchestrationResult | null> {
    // If user explicitly requested an agent, use it
    if (request.preferredAgent) {
        const agent = await getAgent(request.preferredAgent)
        if (agent) {
            return {
                agent,
                confidence: 1.0,
                reasoning: `User explicitly requested ${agent.name}`,
                systemPrompt: buildAgentSystemPrompt(agent, request.projectContext),
                modelOverrides: {
                    temperature: agent.model.temperature,
                    maxTokens: agent.model.maxTokens
                },
                alternativeAgents: []
            }
        }
    }

    // Score all agents based on the prompt
    const scores = await scoreAgentsForPrompt(request.prompt, request.taskType, request.tier)

    if (scores.length === 0) {
        return null
    }

    // Best match
    const best = scores[0]
    const agent = await getAgent(best.agentId)

    if (!agent) {
        return null
    }

    return {
        agent,
        confidence: best.score,
        reasoning: best.reasons.join('; '),
        systemPrompt: buildAgentSystemPrompt(agent, request.projectContext),
        modelOverrides: {
            temperature: agent.model.temperature,
            maxTokens: agent.model.maxTokens
        },
        alternativeAgents: scores.slice(1, 4).map(s => ({
            agent: s.agentId,
            confidence: s.score
        }))
    }
}

interface AgentScore {
    agentId: string
    score: number
    reasons: string[]
}

/**
 * Score all agents based on prompt content
 */
async function scoreAgentsForPrompt(
    prompt: string,
    taskType?: TaskType,
    preferredTier?: AgentTier
): Promise<AgentScore[]> {
    const agents = await listAgents()
    const promptLower = prompt.toLowerCase()
    const scores: AgentScore[] = []

    for (const agent of agents) {
        let score = 0
        const reasons: string[] = []

        // 1. Keyword matching (0-0.4)
        const keywords = AGENT_KEYWORDS[agent.id] || []
        const keywordMatches = keywords.filter(k => promptLower.includes(k))
        if (keywordMatches.length > 0) {
            const keywordScore = Math.min(0.4, keywordMatches.length * 0.1)
            score += keywordScore
            reasons.push(`Keywords: ${keywordMatches.join(', ')}`)
        }

        // 2. Task type matching (0-0.3)
        if (taskType) {
            const taskAgents = TASK_AGENT_MAP[taskType] || []
            const taskIndex = taskAgents.indexOf(agent.id)
            if (taskIndex !== -1) {
                const taskScore = 0.3 - (taskIndex * 0.1)
                score += Math.max(0.1, taskScore)
                reasons.push(`Task type match: ${taskType}`)
            }
        }

        // 3. Tier preference (0-0.2)
        if (preferredTier && agent.tier === preferredTier) {
            score += 0.2
            reasons.push(`Preferred tier: ${preferredTier}`)
        }

        // 4. Tier appropriateness based on prompt complexity (0-0.1)
        const promptComplexity = estimateComplexity(prompt)
        if (promptComplexity === 'high' && agent.tier === 'reasoning') {
            score += 0.1
            reasons.push('Complex prompt → reasoning tier')
        } else if (promptComplexity === 'low' && agent.tier === 'fast') {
            score += 0.1
            reasons.push('Simple prompt → fast tier')
        }

        if (score > 0) {
            scores.push({ agentId: agent.id, score, reasons })
        }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score)

    // If no matches, return a default based on task type or general agent
    if (scores.length === 0) {
        // Default to Analyst for complex, Writer for general
        const defaultAgent = taskType === 'deep_reasoning' ? 'analyst' : 'writer'
        scores.push({
            agentId: defaultAgent,
            score: 0.3,
            reasons: ['Default agent for task type']
        })
    }

    return scores
}

/**
 * Estimate prompt complexity
 */
function estimateComplexity(prompt: string): 'high' | 'medium' | 'low' {
    const words = prompt.split(/\s+/).length
    const hasQuestions = prompt.includes('?')
    const hasMultipleRequests = (prompt.match(/\band\b/gi) || []).length > 2
    const complexKeywords = ['analyze', 'compare', 'evaluate', 'design', 'architect', 'debug', 'why']
    const hasComplexKeywords = complexKeywords.some(k => prompt.toLowerCase().includes(k))

    if (words > 100 || hasComplexKeywords || hasMultipleRequests) {
        return 'high'
    } else if (words < 20 && !hasQuestions) {
        return 'low'
    }
    return 'medium'
}

/**
 * Get recommended agent for a task type
 */
export async function getRecommendedAgent(taskType: TaskType): Promise<AgentDefinition | null> {
    const agentIds = TASK_AGENT_MAP[taskType] || ['writer']
    return await getAgent(agentIds[0])
}

/**
 * Check if agent handoff should occur
 * Returns the agent to hand off to, or null if no handoff needed
 */
export async function checkHandoff(
    currentAgent: AgentDefinition,
    responseContent: string,
    requestPrompt: string
): Promise<AgentDefinition | null> {
    // Check if escalation is needed based on response content
    const escalationTriggers = [
        { pattern: /security vulnerability/i, target: 'architect' },
        { pattern: /needs more research/i, target: 'researcher' },
        { pattern: /verify.*claim/i, target: 'fact-checker' },
        { pattern: /implement.*code/i, target: 'code-reviewer' },
        { pattern: /architectural.*decision/i, target: 'architect' }
    ]

    for (const trigger of escalationTriggers) {
        if (trigger.pattern.test(responseContent)) {
            const targetAgent = await getAgent(trigger.target)
            if (targetAgent && targetAgent.id !== currentAgent.id) {
                return targetAgent
            }
        }
    }

    // Check agent's own escalation rules
    if (currentAgent.guardrails.escalateTo) {
        // This is simplified - in production would check more conditions
        return await getAgent(currentAgent.guardrails.escalateTo)
    }

    return null
}

/**
 * Integration point with the existing ChorumRouter
 * Enhances routing decisions with agent-aware model selection
 */
export interface AgentAwareRoutingResult {
    agent: AgentDefinition | null
    provider: string
    model: string
    systemPrompt: string
    temperature: number
    reasoning: string
}

export async function routeWithAgentAwareness(
    router: ChorumRouter,
    prompt: string,
    projectContext?: string,
    preferredAgent?: string
): Promise<AgentAwareRoutingResult> {
    // First, select the agent
    const orchestration = await selectAgent({
        prompt,
        projectContext,
        preferredAgent
    })

    // Get router's model/provider decision
    const routingDecision = await router.route({ prompt })

    if (orchestration) {
        // Apply agent's model preferences if they override defaults
        const temperature = orchestration.modelOverrides.temperature ?? 0.5

        return {
            agent: orchestration.agent,
            provider: routingDecision.provider,
            model: routingDecision.model,
            systemPrompt: orchestration.systemPrompt,
            temperature,
            reasoning: `Agent: ${orchestration.agent.name} (${Math.round(orchestration.confidence * 100)}% confidence) | ${routingDecision.reasoning}`
        }
    }

    // No agent matched - use generic prompt
    return {
        agent: null,
        provider: routingDecision.provider,
        model: routingDecision.model,
        systemPrompt: projectContext || 'You are a helpful AI assistant.',
        temperature: 0.5,
        reasoning: routingDecision.reasoning
    }
}
