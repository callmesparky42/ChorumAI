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
            ...messages.map(m => {
                if (m.images && m.images.length > 0) {
                    const content: any[] = [{ type: 'text', text: m.content }]
                    m.images.forEach(img => {
                        content.push({
                            type: 'image_url',
                            image_url: { url: img }
                        })
                    })
                    return { role: m.role as 'user' | 'assistant', content }
                }
                return {
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                }
            })
        ]
    })

    return {
        content: result.choices[0].message.content || '',
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0
    }
}
