import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

/**
 * Generic OpenAI-compatible provider
 * Works with LM Studio, vLLM, LocalAI, text-generation-webui, and other
 * servers that expose OpenAI-compatible /v1/chat/completions endpoint
 */
export async function callOpenAICompatible(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    if (!config.baseUrl) {
        throw new Error('OpenAI-compatible provider requires a baseUrl')
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    }

    // Only add auth header if API key is provided (many local servers don't need it)
    if (config.apiKey && config.apiKey !== 'not-required') {
        headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            ]
        })
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI-compatible API error: ${response.status} - ${error}`)
    }

    const result = await response.json()

    return {
        content: result.choices?.[0]?.message?.content || '',
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0
    }
}
