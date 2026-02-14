import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1'

export async function callMistral(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const baseUrl = config.baseUrl || MISTRAL_BASE_URL

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
        throw new Error(`Mistral API error: ${response.status} - ${error}`)
    }

    const result = await response.json()

    const choice = result.choices[0]
    const stopReason = choice.finish_reason || null
    const toolCalls = choice.message.tool_calls || []

    return {
        content: choice.message.content || '',
        model: result.model,
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0,
        stopReason,
        toolCalls
    }
}
