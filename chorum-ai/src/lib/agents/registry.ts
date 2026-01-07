/**
 * Agent Registry
 * 
 * Loads and manages agent definitions from .chorum/agents/*.md files.
 * This is a key differentiator for Chorum - specialized AI personas that
 * maintain context, capabilities, and guardrails.
 */

import fs from 'fs/promises'
import path from 'path'
import { AgentDefinition, AgentTier, BUILT_IN_AGENTS } from './types'

// Cache for loaded agents
let agentCache: Map<string, AgentDefinition> | null = null
let lastCacheTime: number = 0
const CACHE_TTL = 60000 // 1 minute

const AGENTS_DIR = path.join(process.cwd(), '.chorum', 'agents')

/**
 * Parse an agent markdown file into AgentDefinition
 */
export async function parseAgentFile(filePath: string): Promise<AgentDefinition | null> {
    try {
        const content = await fs.readFile(filePath, 'utf-8')
        const filename = path.basename(filePath, '.md')

        // Skip index and schema files
        if (filename.startsWith('_')) {
            return null
        }

        // Extract YAML blocks from markdown
        const yamlBlocks = extractYamlBlocks(content)

        // Parse identity block
        const identity = yamlBlocks.find(b => b.includes('identity:'))
        const model = yamlBlocks.find(b => b.includes('model:'))
        const memory = yamlBlocks.find(b => b.includes('memory:'))
        const capabilities = yamlBlocks.find(b => b.includes('capabilities:'))
        const guardrails = yamlBlocks.find(b => b.includes('guardrails:'))

        // Parse persona from markdown
        const persona = parsePersonaSection(content)

        // Build agent definition from parsed YAML
        const agent: AgentDefinition = {
            id: filename,
            name: parseYamlValue(identity, 'name') || filename,
            role: parseYamlValue(identity, 'role') || '',
            icon: parseYamlValue(identity, 'icon')?.replace(/"/g, '') || '🤖',
            tier: (parseYamlValue(identity, 'tier') as AgentTier) || 'balanced',

            persona: {
                description: persona.description || '',
                tone: persona.tone || '',
                principles: persona.principles || []
            },

            model: {
                temperature: parseFloat(parseYamlValue(model, 'temperature') || '0.5'),
                maxTokens: parseInt(parseYamlValue(model, 'max_tokens') || '4000'),
                reasoningMode: parseYamlValue(model, 'reasoning_mode') === 'true'
            },

            memory: {
                semanticFocus: parseYamlValue(memory, 'semantic_focus')?.replace(/"/g, '') || '',
                requiredContext: parseYamlArray(memory, 'required_context'),
                optionalContext: parseYamlArray(memory, 'optional_context'),
                writesBack: parseYamlArray(memory, 'writes_back')
            },

            capabilities: {
                tools: parseYamlArray(capabilities, 'tools'),
                actions: parseYamlArray(capabilities, 'actions'),
                boundaries: parseYamlArray(capabilities, 'boundaries')
            },

            guardrails: {
                hardLimits: parseYamlArray(guardrails, 'hard_limits'),
                escalateTo: parseYamlValue(guardrails, 'to_agent'),
                humanCheckpoint: parseYamlValue(guardrails, 'to_human')
            },

            isBuiltIn: isBuiltInAgent(filename),
            isCustom: !isBuiltInAgent(filename)
        }

        return agent
    } catch (e) {
        console.warn(`Failed to parse agent file: ${filePath}`, e)
        return null
    }
}

/**
 * Extract YAML code blocks from markdown
 */
function extractYamlBlocks(content: string): string[] {
    const blocks: string[] = []
    const regex = /```yaml\n([\s\S]*?)```/g
    let match
    while ((match = regex.exec(content)) !== null) {
        blocks.push(match[1])
    }
    return blocks
}

/**
 * Parse a value from YAML content
 */
function parseYamlValue(yaml: string | undefined, key: string): string | undefined {
    if (!yaml) return undefined
    const regex = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm')
    const match = yaml.match(regex)
    return match ? match[1].trim() : undefined
}

/**
 * Parse an array from YAML content
 */
function parseYamlArray(yaml: string | undefined, key: string): string[] {
    if (!yaml) return []

    // Find the key and capture indented items
    const keyIndex = yaml.indexOf(`${key}:`)
    if (keyIndex === -1) return []

    const afterKey = yaml.substring(keyIndex)
    const lines = afterKey.split('\n').slice(1)
    const items: string[] = []

    for (const line of lines) {
        // Stop at next key (no leading dash or different indent)
        if (line.match(/^\s*\w+:/) && !line.trim().startsWith('-')) break

        // Match array items
        const match = line.match(/^\s*-\s*(.+)$/)
        if (match) {
            items.push(match[1].trim().replace(/"/g, ''))
        }
    }

    return items
}

/**
 * Parse persona section from markdown
 */
function parsePersonaSection(content: string): { description?: string; tone?: string; principles?: string[] } {
    const result: { description?: string; tone?: string; principles?: string[] } = {}

    // Find ## Persona section
    const personaMatch = content.match(/## Persona\s*\n([\s\S]*?)(?=\n---|\n##|$)/)
    if (!personaMatch) return result

    const section = personaMatch[1]

    // Extract description (first bold paragraph)
    const descMatch = section.match(/\*\*([^*]+)\*\*/)
    if (descMatch) {
        result.description = descMatch[1].trim()
    }

    // Extract tone
    const toneMatch = section.match(/\*\*Tone:\*\*\s*(.+)/)
    if (toneMatch) {
        result.tone = toneMatch[1].trim()
    }

    // Extract principles
    const principlesMatch = section.match(/\*\*Principles:\*\*\s*\n([\s\S]*?)(?=\n\n|\n---|\n##|$)/)
    if (principlesMatch) {
        result.principles = principlesMatch[1]
            .split('\n')
            .filter(l => l.trim().startsWith('-'))
            .map(l => l.replace(/^-\s*/, '').trim())
    }

    return result
}

/**
 * Check if agent is built-in
 */
function isBuiltInAgent(name: string): boolean {
    const builtInNames = [
        'analyst', 'architect', 'code-reviewer', 'debugger',
        'researcher', 'writer', 'editor', 'copywriter',
        'fact-checker', 'planner', 'translator', 'tutor',
        'summarizer', 'coordinator'
    ]
    return builtInNames.includes(name.toLowerCase())
}

/**
 * Load all agents from .chorum/agents/
 * Returns both built-in agents (from MD files) and custom agents
 */
export async function loadAllAgents(): Promise<AgentDefinition[]> {
    // Check cache
    if (agentCache && Date.now() - lastCacheTime < CACHE_TTL) {
        return Array.from(agentCache.values())
    }

    const agents: AgentDefinition[] = []

    try {
        // Ensure directory exists
        await fs.mkdir(AGENTS_DIR, { recursive: true })

        const files = await fs.readdir(AGENTS_DIR)
        const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('_'))

        for (const file of mdFiles) {
            const agent = await parseAgentFile(path.join(AGENTS_DIR, file))
            if (agent) {
                agents.push(agent)
            }
        }
    } catch (e) {
        console.warn('Failed to load agents from directory, using built-in definitions', e)

        // Fallback to hardcoded definitions
        for (const agent of BUILT_IN_AGENTS) {
            agents.push({
                ...agent,
                id: agent.name.toLowerCase().replace(/\s+/g, '-'),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            })
        }
    }

    // Update cache
    agentCache = new Map(agents.map(a => [a.id, a]))
    lastCacheTime = Date.now()

    return agents
}

/**
 * Get a specific agent by ID or name
 */
export async function getAgent(nameOrId: string): Promise<AgentDefinition | null> {
    const agents = await loadAllAgents()
    const normalized = nameOrId.toLowerCase().replace(/\s+/g, '-')

    return agents.find(a =>
        a.id === normalized ||
        a.name.toLowerCase() === nameOrId.toLowerCase()
    ) || null
}

/**
 * List all available agents
 */
export async function listAgents(): Promise<{ id: string; name: string; icon: string; tier: AgentTier; role: string }[]> {
    const agents = await loadAllAgents()
    return agents.map(a => ({
        id: a.id,
        name: a.name,
        icon: a.icon,
        tier: a.tier,
        role: a.role
    }))
}

/**
 * Get agents by tier
 */
export async function getAgentsByTier(tier: AgentTier): Promise<AgentDefinition[]> {
    const agents = await loadAllAgents()
    return agents.filter(a => a.tier === tier)
}

/**
 * Get agent for a specific capability
 */
export async function getAgentForCapability(capability: string): Promise<AgentDefinition | null> {
    const agents = await loadAllAgents()

    // Find agent that has this capability
    return agents.find(a =>
        a.capabilities.tools.includes(capability) ||
        a.capabilities.actions.some(action =>
            action.toLowerCase().includes(capability.toLowerCase())
        )
    ) || null
}

/**
 * Clear the agent cache (useful after creating/updating agents)
 */
export function clearAgentCache(): void {
    agentCache = null
    lastCacheTime = 0
}

/**
 * Build a system prompt for an agent, injecting its persona and guardrails
 */
export function buildAgentSystemPrompt(agent: AgentDefinition, basePrompt: string = ''): string {
    const sections: string[] = []

    // Agent identity
    sections.push(`# You are ${agent.name} ${agent.icon}`)
    sections.push(`**Role:** ${agent.role}`)
    sections.push('')

    // Persona
    sections.push('## Persona')
    sections.push(agent.persona.description)
    sections.push(`**Tone:** ${agent.persona.tone}`)
    sections.push('')

    // Principles
    if (agent.persona.principles.length > 0) {
        sections.push('## Core Principles')
        for (const principle of agent.persona.principles) {
            sections.push(`- ${principle}`)
        }
        sections.push('')
    }

    // Guardrails
    if (agent.guardrails.hardLimits.length > 0) {
        sections.push('## Hard Limits (NEVER VIOLATE)')
        for (const limit of agent.guardrails.hardLimits) {
            sections.push(`- ${limit}`)
        }
        sections.push('')
    }

    // Boundaries
    if (agent.capabilities.boundaries.length > 0) {
        sections.push('## Boundaries')
        for (const boundary of agent.capabilities.boundaries) {
            sections.push(`- ${boundary}`)
        }
        sections.push('')
    }

    // Semantic focus
    if (agent.memory.semanticFocus) {
        sections.push('## Memory Focus')
        sections.push(`When consulting project memory, ask: "${agent.memory.semanticFocus}"`)
        sections.push('')
    }

    // Append base prompt
    if (basePrompt) {
        sections.push('---')
        sections.push('')
        sections.push(basePrompt)
    }

    return sections.join('\n')
}
