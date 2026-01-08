import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { AgentDefinition } from '@/lib/agents/types'
import { auth } from '@/lib/auth'

// Directory where custom agents are stored
const AGENTS_DIR = path.join(process.cwd(), '.chorum', 'agents')

// Convert agent name to filename
function toFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md'
}

// Convert AgentDefinition to markdown format
function agentToMarkdown(agent: AgentDefinition): string {
  return `# Agent: ${agent.name}

\`\`\`yaml
identity:
  name: ${agent.name.toLowerCase().replace(/\s+/g, '-')}
  role: ${agent.role}
  icon: "${agent.icon}"
  tier: ${agent.tier}
\`\`\`

## Persona

**${agent.persona.description}**

**Tone:** ${agent.persona.tone}

**Principles:**
${agent.persona.principles.map(p => `- ${p}`).join('\n')}

---

## Model Configuration

\`\`\`yaml
model:
  tier: ${agent.tier}
  temperature: ${agent.model.temperature}
  max_tokens: ${agent.model.maxTokens}
  reasoning_mode: ${agent.model.reasoningMode}
\`\`\`

---

## Memory Configuration

### Semantic Focus

> **"${agent.memory.semanticFocus}"**

\`\`\`yaml
memory:
  semantic_focus: "${agent.memory.semanticFocus}"

  required_context:
${agent.memory.requiredContext.map(c => `    - ${c}`).join('\n') || '    []'}

  optional_context:
${agent.memory.optionalContext.map(c => `    - ${c}`).join('\n') || '    []'}

  writes_back:
${agent.memory.writesBack.map(w => `    - ${w}`).join('\n') || '    []'}
\`\`\`

---

## Capabilities

\`\`\`yaml
capabilities:
  tools:
${agent.capabilities.tools.map(t => `    - ${t}`).join('\n') || '    []'}

  actions:
${agent.capabilities.actions.map(a => `    - ${a}`).join('\n') || '    []'}

  boundaries:
${agent.capabilities.boundaries.map(b => `    - ${b}`).join('\n') || '    []'}
\`\`\`

---

## Guardrails

\`\`\`yaml
guardrails:
  hard_limits:
${agent.guardrails.hardLimits.map(g => `    - ${g}`).join('\n')}
${agent.guardrails.escalateTo ? `
  escalation:
    to_agent: ${agent.guardrails.escalateTo}` : ''}
${agent.guardrails.humanCheckpoint ? `
    to_human: "${agent.guardrails.humanCheckpoint}"` : ''}
\`\`\`

---

*Custom agent created: ${agent.createdAt}*
*Last updated: ${agent.updatedAt}*
`
}

// GET - List all custom agents
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await fs.mkdir(AGENTS_DIR, { recursive: true })

    const files = await fs.readdir(AGENTS_DIR)
    const customAgentFiles = files.filter(f =>
      f.endsWith('.md') &&
      !f.startsWith('_') && // Skip schema and index files
      !['analyst', 'architect', 'code-reviewer', 'debugger', 'researcher',
        'writer', 'editor', 'copywriter', 'fact-checker', 'planner',
        'translator', 'tutor', 'summarizer', 'coordinator'].includes(f.replace('.md', ''))
    )

    return NextResponse.json({ files: customAgentFiles })
  } catch (error) {
    console.error('Failed to list agents:', error)
    return NextResponse.json({ files: [] })
  }
}

// POST - Save a custom agent
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agent: AgentDefinition = await request.json()

    // Ensure directory exists
    await fs.mkdir(AGENTS_DIR, { recursive: true })

    // Convert to markdown and save
    const markdown = agentToMarkdown(agent)
    const filename = toFilename(agent.name)
    const filepath = path.join(AGENTS_DIR, filename)

    await fs.writeFile(filepath, markdown, 'utf-8')

    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error('Failed to save agent:', error)
    return NextResponse.json(
      { error: 'Failed to save agent' },
      { status: 500 }
    )
  }
}
