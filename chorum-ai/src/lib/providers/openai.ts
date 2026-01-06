import OpenAI from 'openai'
import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

export async function callOpenAI(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const openai = new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    const result = await openai.chat.completions.create({
        model: config.model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content
            }))
        ]
    })

    return {
        content: result.choices[0].message.content || '',
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0
    }
}
