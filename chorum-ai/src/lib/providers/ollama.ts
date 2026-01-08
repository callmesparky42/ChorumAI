import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'
import { secureFetch } from '@/lib/secure-fetch'

const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

export async function callOllama(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const baseUrl = config.baseUrl || DEFAULT_OLLAMA_URL

    // Ollama uses its own API format
    // Use secureFetch to respect strictSsl setting for enterprise deployments
    const response = await secureFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            ],
            stream: false
        }),
        securitySettings: config.securitySettings
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${error}`)
    }

    const result = await response.json()

    // Ollama returns token counts differently
    return {
        content: result.message?.content || '',
        tokensInput: result.prompt_eval_count || 0,
        tokensOutput: result.eval_count || 0
    }
}
