import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'
import { secureFetch } from '@/lib/secure-fetch'

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

// Ollama can be slow on first inference (model loading into VRAM)
// 5 minutes timeout for initial load - subsequent calls are much faster
const OLLAMA_TIMEOUT_MS = 5 * 60 * 1000

export async function callOllama(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    let baseUrl = config.baseUrl || DEFAULT_OLLAMA_URL

    // Sanitize URL: Remove trailing slash and /v1 suffix if present
    // Native Ollama API uses /api/chat, so we don't want /v1
    baseUrl = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')

    // Normalize model name - Ollama accepts 'phi3' but stores as 'phi3:latest'
    const model = config.model.includes(':') ? config.model : config.model

    console.log(`[Ollama] Calling model="${model}" at ${baseUrl}/api/chat`)
    console.log(`[Ollama] Config:`, JSON.stringify({ model, baseUrl, isLocal: config.isLocal, hasSecuritySettings: !!config.securitySettings }))

    // Truncate system prompt for small local models to avoid context overflow
    // phi3 has ~4K context, so we limit system prompt to ~2K chars to leave room for conversation
    const MAX_SYSTEM_PROMPT_CHARS = 2000
    let truncatedPrompt = systemPrompt
    if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
        truncatedPrompt = systemPrompt.slice(0, MAX_SYSTEM_PROMPT_CHARS) + '\n\n[Context truncated for local model]'
        console.log(`[Ollama] System prompt truncated from ${systemPrompt.length} to ${truncatedPrompt.length} chars`)
    }

    // Build the request body
    const requestBody = {
        model,
        messages: [
            { role: 'system', content: truncatedPrompt },
            ...messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ],
        stream: false,
        // Keep model loaded for 5 minutes after last use (faster subsequent calls)
        keep_alive: '5m'
    }

    const bodyStr = JSON.stringify(requestBody)
    const startTime = Date.now()

    console.log(`[Ollama] Request payload: ${bodyStr.length} bytes, ${requestBody.messages.length} messages`)
    console.log(`[Ollama] System prompt length: ${systemPrompt.length} chars`)
    console.log(`[Ollama] Starting fetch to ${baseUrl}/api/chat...`)

    // Ollama uses its own API format
    // Use secureFetch to respect strictSsl setting for enterprise deployments
    const response = await secureFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: bodyStr,
        securitySettings: config.securitySettings,
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS)
    })

    const elapsed = Date.now() - startTime
    console.log(`[Ollama] Response received in ${elapsed}ms, status: ${response.status}`)

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${error}`)
    }

    const result = await response.json()
    console.log(`[Ollama] Success! Tokens: ${result.prompt_eval_count || 0} in, ${result.eval_count || 0} out`)

    // Ollama returns token counts differently
    return {
        content: result.message.content,
        model: result.model,
        tokensInput: result.prompt_eval_count || 0,
        tokensOutput: result.eval_count || 0,
        stopReason: result.done_reason === 'stop' ? 'end_turn' : 'max_tokens', // Approximate map
        toolCalls: [] // Ollama does not natively support tool calls
    }
}
