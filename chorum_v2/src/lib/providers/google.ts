import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export async function callGoogle(
  config: ProviderCallConfig,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<ChatResult> {
  const baseUrl = (config.baseUrl ?? GOOGLE_BASE_URL).replace(/\/$/, '')
  const endpoint = `${baseUrl}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const payload = buildGeminiPayload(messages, systemPrompt)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google API error: ${response.status} - ${text}`)
  }

  const result = (await response.json()) as GeminiResponse
  const first = result.candidates?.[0]
  const content = (first?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')

  let stopReason: ChatResult['stopReason'] = 'end_turn'
  if (first?.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens'
  if (first?.finishReason === 'STOP') stopReason = 'end_turn'

  return {
    content,
    model: config.model,
    tokensInput: result.usageMetadata?.promptTokenCount ?? 0,
    tokensOutput: result.usageMetadata?.candidatesTokenCount ?? 0,
    stopReason,
  }
}

function buildGeminiPayload(messages: ChatMessage[], systemPrompt: string): Record<string, unknown> {
  const conversation = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))

  return {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents: conversation,
  }
}
