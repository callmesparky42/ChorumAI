import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

export async function callDeepSeek(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const baseUrl = config.baseUrl || DEEPSEEK_BASE_URL

    // DeepSeek uses OpenAI-compatible API
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
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
        throw new Error(`DeepSeek API error: ${response.status} - ${error}`)
    }

    const result = await response.json()

    return {
        content: result.choices[0].message.content || '',
        model: result.model,
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0,
        stopReason: result.choices[0].finish_reason || null
    }
}
