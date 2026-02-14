import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'

export async function callAnthropic(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const anthropic = new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    // Convert tools to Anthropic format
    const tools = config.tools?.map(t => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema
    }))

    // Convert tool_choice to Anthropic format
    let toolChoice: Anthropic.MessageCreateParams['tool_choice'] | undefined
    if (config.toolChoice) {
        if (config.toolChoice === 'auto') {
            toolChoice = { type: 'auto' }
        } else if (config.toolChoice === 'none') {
            toolChoice = undefined // Anthropic doesn't have explicit 'none'
        } else if (typeof config.toolChoice === 'object') {
            toolChoice = { type: 'tool', name: config.toolChoice.name }
        }
    }

    // Filter out system messages - Anthropic uses separate system param
    const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => {
            // Handle assistant message with tool calls
            if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
                const content: Anthropic.ContentBlockParam[] = []
                if (m.content) {
                    content.push({ type: 'text', text: m.content })
                }
                m.toolCalls.forEach(tc => {
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.name,
                        input: tc.arguments
                    })
                })
                return { role: 'assistant' as const, content }
            }

            // Handle user message with tool results
            if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
                const content: Anthropic.ToolResultBlockParam[] = m.toolResults.map(tr => ({
                    type: 'tool_result' as const,
                    tool_use_id: tr.toolCallId,
                    content: tr.content,
                    is_error: tr.isError
                }))
                return { role: 'user' as const, content }
            }

            // Handle regular messages with images
            if (m.images && m.images.length > 0) {
                const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: m.content }]
                m.images.forEach(img => {
                    const match = img.match(/^data:(image\/\w+);base64,(.+)$/)
                    if (match) {
                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
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
        messages: chatMessages,
        ...(tools && tools.length > 0 && { tools }),
        ...(toolChoice && { tool_choice: toolChoice })
    })

    // Extract text content
    const textContent = result.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('')

    // Extract tool calls
    const toolCalls: ToolCall[] = result.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map(block => ({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>
        }))

    // Map stop reason
    let stopReason: ChatResult['stopReason'] = 'end_turn'
    if (result.stop_reason === 'tool_use') {
        stopReason = 'tool_use'
    } else if (result.stop_reason === 'max_tokens') {
        stopReason = 'max_tokens'
    } else if (result.stop_reason === 'stop_sequence') {
        stopReason = 'stop_sequence'
    }

    return {
        content: textContent,
        model: config.model,
        tokensInput: result.usage.input_tokens,
        tokensOutput: result.usage.output_tokens,
        stopReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    }
}
