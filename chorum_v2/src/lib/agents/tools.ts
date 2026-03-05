import type { AgentDefinition } from './types'

const ALL_TOOLS = [
  'start_session',
  'get_context',
  'read_nebula',
  'inject_learning',
  'extract_learnings',
  'submit_feedback',
  'end_session',
]

export function isToolAllowed(persona: AgentDefinition, tool: string): boolean {
  if (persona.allowedTools.length === 0) return true
  return persona.allowedTools.includes(tool)
}

export function getAvailableTools(persona: AgentDefinition): string[] {
  if (persona.allowedTools.length === 0) return ALL_TOOLS
  return persona.allowedTools.filter((tool) => ALL_TOOLS.includes(tool))
}
