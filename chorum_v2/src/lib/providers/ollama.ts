import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

interface OllamaResponse {
  message?: { content?: string }
  model?: string
  prompt_eval_count?: number
  eval_count?: number
  done_reason?: string
}

export async function callOllama(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  let baseUrl = (config.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, '')
  baseUrl = baseUrl.replace(/\/v1$/, '')

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
      stream: false,
      keep_alive: '5m',
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Ollama API error: ${response.status} - ${text}`)
  }

  const result = (await response.json()) as OllamaResponse

  return {
    content: result.message?.content ?? '',
    model: result.model ?? config.model,
    tokensInput: result.prompt_eval_count ?? 0,
    tokensOutput: result.eval_count ?? 0,
    stopReason: result.done_reason === 'stop' ? 'end_turn' : 'max_tokens',
  }
}
