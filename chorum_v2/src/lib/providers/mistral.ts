import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

interface MistralResponse {
  model?: string
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string | null }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1'

export async function callMistral(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  const baseUrl = (config.baseUrl ?? MISTRAL_BASE_URL).replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mistral API error: ${response.status} - ${text}`)
  }

  const result = (await response.json()) as MistralResponse
  const choice = result.choices?.[0]

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
  }
}
