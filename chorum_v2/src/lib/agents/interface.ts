import type { AgentChatInput, AgentChatResult, AgentDefinition } from './types'

export interface AgentInterface {
  chat(input: AgentChatInput): AsyncGenerator<string>
  chatSync(input: AgentChatInput): Promise<AgentChatResult>
  getAgents(userId: string): Promise<AgentDefinition[]>
  route(query: string, userId: string): Promise<AgentDefinition>
}
