import { chat as chatStream, chatSync as chatSyncImpl } from './chat'
import { getPersonas } from './personas'
import { route as routeQuery } from './router'
import type { AgentInterface } from './interface'
import type { AgentChatInput, AgentChatResult, AgentDefinition } from './types'

export class AgentImpl implements AgentInterface {
  async *chat(input: AgentChatInput): AsyncGenerator<string> {
    yield* chatStream(input)
  }

  async chatSync(input: AgentChatInput): Promise<AgentChatResult> {
    return chatSyncImpl(input)
  }

  async getAgents(userId: string): Promise<AgentDefinition[]> {
    return getPersonas(userId)
  }

  async route(query: string, userId: string): Promise<AgentDefinition> {
    const decision = await routeQuery(query, userId)
    return decision.persona
  }
}

export function createAgent(): AgentInterface {
  return new AgentImpl()
}
