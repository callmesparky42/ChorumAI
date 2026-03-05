import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'

interface OpenAICompatibleResponse {
  model?: string
  choices?: Array<{
    finish_reason?: string
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export async function callOpenAICompatible(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  if (!config.baseUrl) {
    throw new Error('OpenAI-compatible provider requires a baseUrl')
  }

  let baseUrl = config.baseUrl.replace(/\/$/, '')
  if (baseUrl.includes(':11434') && !baseUrl.endsWith('/v1')) {
    baseUrl += '/v1'
  }
  baseUrl = baseUrl.replace(/\/chat\/completions$/, '')

  const payload = buildPayload(config, messages, systemPrompt)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey && config.apiKey !== 'not-required') {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI-compatible API error: ${response.status} - ${text}`)
  }

  const result = (await response.json()) as OpenAICompatibleResponse
  const choice = result.choices?.[0]
  const toolCalls = parseToolCalls(choice?.message?.tool_calls)

  let stopReason: ChatResult['stopReason'] = 'end_turn'
  if (choice?.finish_reason === 'tool_calls') stopReason = 'tool_use'
  if (choice?.finish_reason === 'length') stopReason = 'max_tokens'
  if (choice?.finish_reason === 'stop_sequence') stopReason = 'stop_sequence'

  return {
    content: choice?.message?.content ?? '',
    model: result.model ?? config.model,
    tokensInput: result.usage?.prompt_tokens ?? 0,
    tokensOutput: result.usage?.completion_tokens ?? 0,
    stopReason,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  }
}

function buildPayload(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Record<string, unknown> {
  const apiMessages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ]

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      apiMessages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments),
          },
        })),
      })
      continue
    }

    if (message.role === 'user' && message.toolResults && message.toolResults.length > 0) {
      for (const toolResult of message.toolResults) {
        apiMessages.push({
          role: 'tool',
          tool_call_id: toolResult.toolCallId,
          content: toolResult.content,
        })
      }
      continue
    }

    apiMessages.push({
      role: message.role,
      content: message.content,
    })
  }

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: apiMessages,
  }

  if (config.tools && config.tools.length > 0) {
    payload.tools = config.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))

    if (config.toolChoice === 'auto' || config.toolChoice === 'none') {
      payload.tool_choice = config.toolChoice
    } else if (config.toolChoice) {
      payload.tool_choice = {
        type: 'function',
        function: { name: config.toolChoice.name },
      }
    }
  }

  return payload
}

function parseToolCalls(
  toolCalls:
    | Array<{
      id?: string
      function?: {
        name?: string
        arguments?: string
      }
    }>
    | undefined,
): ToolCall[] {
  if (!Array.isArray(toolCalls)) return []

  return toolCalls
    .map((toolCall): ToolCall | null => {
      const id = toolCall.id
      const name = toolCall.function?.name
      const argsRaw = toolCall.function?.arguments ?? '{}'
      if (!id || !name) return null

      let parsedArgs: Record<string, unknown> = {}
      try {
        const maybeObject = JSON.parse(argsRaw) as unknown
        if (typeof maybeObject === 'object' && maybeObject !== null) {
          parsedArgs = maybeObject as Record<string, unknown>
        }
      } catch {
        parsedArgs = {}
      }

      return { id, name, arguments: parsedArgs }
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null)
}
