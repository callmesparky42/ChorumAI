import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

export async function callAnthropic(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const anthropic = new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    // Filter out system messages - Anthropic uses separate system param
    const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => {
            if (m.images && m.images.length > 0) {
                const content: any[] = [{ type: 'text', text: m.content }]
                m.images.forEach(img => {
                    const match = img.match(/^data:(image\/\w+);base64,(.+)$/)
                    if (match) {
                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: match[1] as any,
                                data: match[2]
                            }
                        })
                    }
                })
                return { role: m.role as 'user' | 'assistant', content }
            }
            return {
                role: m.role as 'user' | 'assistant',
                content: m.content
            }
        })

    const result = await anthropic.messages.create({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: chatMessages
    })

    const content = result.content[0].type === 'text' ? result.content[0].text : ''

    return {
        content,
        tokensInput: result.usage.input_tokens,
        tokensOutput: result.usage.output_tokens
    }
}
