import OpenAI from 'openai'
import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'

export async function callOpenAI(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const openai = new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    // Convert tools to OpenAI format
    const tools: OpenAI.ChatCompletionTool[] | undefined = config.tools?.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }
    }))

    // Convert tool_choice to OpenAI format
    let toolChoice: OpenAI.ChatCompletionToolChoiceOption | undefined
    if (config.toolChoice) {
        if (config.toolChoice === 'auto') {
            toolChoice = 'auto'
        } else if (config.toolChoice === 'none') {
            toolChoice = 'none'
        } else if (typeof config.toolChoice === 'object') {
            toolChoice = { type: 'function', function: { name: config.toolChoice.name } }
        }
    }

    // Build messages array
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt }
    ]

    for (const m of messages) {
        // Handle assistant message with tool calls
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
            openaiMessages.push({
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments)
                    }
                }))
            })
            continue
        }

        // Handle user message with tool results - OpenAI expects one message per tool result
        if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
            for (const tr of m.toolResults) {
                openaiMessages.push({
                    role: 'tool',
                    tool_call_id: tr.toolCallId,
                    content: tr.content
                })
            }
            continue
        }

        // Handle regular messages with images (only valid for user messages)
        if (m.images && m.images.length > 0 && m.role === 'user') {
            const content: OpenAI.ChatCompletionContentPart[] = [{ type: 'text', text: m.content }]
            m.images.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: { url: img }
                })
            })
            openaiMessages.push({ role: 'user', content })
            continue
        }

        // Regular text message
        openaiMessages.push({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content
        })
    }

    const result = await openai.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        ...(tools && tools.length > 0 && { tools }),
        ...(toolChoice && { tool_choice: toolChoice })
    })

    const choice = result.choices[0]

    // Extract tool calls
    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map(tc => {
        // Handle both function type and custom type tool calls
        if (tc.type === 'function') {
            return {
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments || '{}')
            }
        }
        // For custom tool types, try to extract what we can
        return {
            id: tc.id,
            name: 'unknown',
            arguments: {}
        }
    }).filter(tc => tc.name !== 'unknown')

    // Map finish reason to stop reason
    let stopReason: ChatResult['stopReason'] = 'end_turn'
    if (choice.finish_reason === 'tool_calls') {
        stopReason = 'tool_use'
    } else if (choice.finish_reason === 'length') {
        stopReason = 'max_tokens'
    } else if (choice.finish_reason === 'stop') {
        stopReason = 'end_turn'
    }

    return {
        content: choice.message.content || '',
        model: result.model,
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0,
        stopReason,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    }
}

export async function callOpenAIImage(
    config: ProviderCallConfig,
    prompt: string
): Promise<ChatResult> {
    const openai = new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl && { baseURL: config.baseUrl })
    })

    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
        })

        if (!response.data || response.data.length === 0) {
            throw new Error("No image data returned from OpenAI")
        }

        const image = response.data[0]
        const imageUrl = image.b64_json
            ? `data:image/png;base64,${image.b64_json}`
            : image.url

        if (!imageUrl) throw new Error("No image URL returned")

        return {
            content: `Here is the generated image based on your request: "${prompt}"`,
            // Return standard tokens as 0 since DALL-E uses different billing
            tokensInput: 0,
            tokensOutput: 0,
            stopReason: 'end_turn',
            // Return image as legacy image array for UI compatibility
            // The Message component will render this nicely
            images: [imageUrl]
        }
    } catch (error: any) {
        console.error("OpenAI Image Generation Error:", error)
        throw new Error(`Image generation failed: ${error.message}`)
    }
}
