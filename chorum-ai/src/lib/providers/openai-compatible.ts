import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'
import { secureFetch } from '@/lib/secure-fetch'

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

    let baseUrl = config.baseUrl.replace(/\/$/, '')

    // Heuristic: If it looks like Ollama (port 11434) and doesn't have /v1, add it
    if (baseUrl.includes(':11434') && !baseUrl.endsWith('/v1')) {
        baseUrl += '/v1'
    }

    // Remove /chat/completions if user accidentally included it
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '')

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    }

    // Only add auth header if API key is provided (many local servers don't need it)
    if (config.apiKey && config.apiKey !== 'not-required') {
        headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    // Convert tools to OpenAI format if provided
    const tools = config.tools?.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }
    }))

    // Convert tool_choice to OpenAI format
    let toolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined
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
    const apiMessages: any[] = [
        { role: 'system', content: systemPrompt }
    ]

    for (const m of messages) {
        // Handle assistant message with tool calls
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
            apiMessages.push({
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments)
                    }
                }))
            })
            continue
        }

        // Handle user message with tool results
        if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
            for (const tr of m.toolResults) {
                apiMessages.push({
                    role: 'tool',
                    tool_call_id: tr.toolCallId,
                    content: tr.content
                })
            }
            continue
        }

        // Regular message
        apiMessages.push({
            role: m.role,
            content: m.content
        })
    }

    // Build request body
    const requestBody: any = {
        model: config.model,
        messages: apiMessages
    }

    // Only include tools if provided (some servers don't support it)
    if (tools && tools.length > 0) {
        requestBody.tools = tools
        if (toolChoice) {
            requestBody.tool_choice = toolChoice
        }
    }

    // Use secureFetch to respect strictSsl setting for enterprise deployments
    const response = await secureFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        securitySettings: config.securitySettings
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI-compatible API error: ${response.status} - ${error}`)
    }

    const result = await response.json()
    const choice = result.choices?.[0]

    // Extract tool calls if present
    const toolCalls: ToolCall[] | undefined = choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}')
    }))

    // Map finish reason
    let stopReason: ChatResult['stopReason'] = 'end_turn'
    if (choice?.finish_reason === 'tool_calls') {
        stopReason = 'tool_use'
    } else if (choice?.finish_reason === 'length') {
        stopReason = 'max_tokens'
    }

    return {
        content: choice?.message?.content || '',
        model: result.model || config.model,
        tokensInput: result.usage?.prompt_tokens || 0,
        tokensOutput: result.usage?.completion_tokens || 0,
        stopReason,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    }
}
