import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'

interface AnthropicResponse {
  content?: Array<{
    type?: string
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
  stop_reason?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'

export async function callAnthropic(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  const baseUrl = (config.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, '')
  const payload = buildAnthropicPayload(config, messages, systemPrompt)

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${text}`)
  }

  const result = (await response.json()) as AnthropicResponse
  const textContent = (result.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')

  const toolCalls = (result.content ?? [])
    .filter((block) => block.type === 'tool_use')
    .map((block): ToolCall | null => {
      if (!block.id || !block.name) return null
      return {
        id: block.id,
        name: block.name,
        arguments: block.input ?? {},
      }
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null)

  let stopReason: ChatResult['stopReason'] = 'end_turn'
  if (result.stop_reason === 'tool_use') stopReason = 'tool_use'
  if (result.stop_reason === 'max_tokens') stopReason = 'max_tokens'
  if (result.stop_reason === 'stop_sequence') stopReason = 'stop_sequence'

  return {
    content: textContent,
    model: config.model,
    tokensInput: result.usage?.input_tokens ?? 0,
    tokensOutput: result.usage?.output_tokens ?? 0,
    stopReason,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  }
}

function buildAnthropicPayload(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Record<string, unknown> {
  const transformed = messages
    .filter((message) => message.role !== 'system')
    .map((message): Record<string, unknown> => {
      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
        const content: Array<Record<string, unknown>> = []
        if (message.content) {
          content.push({ type: 'text', text: message.content })
        }
        content.push(...message.toolCalls.map((toolCall) => ({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.arguments,
        })))
        return { role: 'assistant', content }
      }

      if (message.role === 'user' && message.toolResults && message.toolResults.length > 0) {
        return {
          role: 'user',
          content: message.toolResults.map((toolResult) => ({
            type: 'tool_result',
            tool_use_id: toolResult.toolCallId,
            content: toolResult.content,
            is_error: toolResult.isError,
          })),
        }
      }

      return {
        role: message.role,
        content: message.content,
      }
    })

  const payload: Record<string, unknown> = {
    model: config.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: transformed,
  }

  if (config.tools && config.tools.length > 0) {
    payload.tools = config.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema,
    }))
  }

  if (config.toolChoice && typeof config.toolChoice === 'object') {
    payload.tool_choice = { type: 'tool', name: config.toolChoice.name }
  } else if (config.toolChoice === 'auto') {
    payload.tool_choice = { type: 'auto' }
  }

  return payload
}
