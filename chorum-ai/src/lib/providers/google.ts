import { GoogleGenerativeAI, SchemaType, type Part, type Content, type FunctionDeclarationSchema, type FunctionDeclarationSchemaProperty, type Tool as GeminiTool } from '@google/generative-ai'
import type { ChatMessage, ChatResult, ProviderCallConfig, ToolCall } from './types'
import { v4 as uuidv4 } from 'uuid'

export async function callGoogle(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const genAI = new GoogleGenerativeAI(config.apiKey)

    // Convert tools to Gemini function declarations
    const tools: GeminiTool[] | undefined = config.tools && config.tools.length > 0 ? [{
        functionDeclarations: config.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            parameters: convertToGeminiSchema(t.inputSchema) as unknown as FunctionDeclarationSchema
        }))
    }] : undefined

    const model = genAI.getGenerativeModel({
        model: config.model,
        systemInstruction: systemPrompt,
        ...(tools && { tools })
    })

    // Convert to Gemini format
    // Important: Gemini requires history to START with a 'user' role message
    const geminiHistory: Content[] = []

    for (let i = 0; i < messages.length - 1; i++) {
        const m = messages[i]

        // Handle assistant message with tool calls (function calls in Gemini)
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
            const parts: Part[] = []
            if (m.content) {
                parts.push({ text: m.content })
            }
            m.toolCalls.forEach(tc => {
                parts.push({
                    functionCall: {
                        name: tc.name,
                        args: tc.arguments
                    }
                })
            })
            geminiHistory.push({ role: 'model', parts })
            continue
        }

        // Handle user message with tool results (function responses in Gemini)
        // Gemini requires functionResponse to use role 'function', NOT 'user'
        if (m.role === 'user' && m.toolResults && m.toolResults.length > 0) {
            const parts: Part[] = m.toolResults.map(tr => ({
                functionResponse: {
                    name: findToolName(messages, tr.toolCallId) || 'unknown',
                    response: { result: tr.content }
                }
            }))
            geminiHistory.push({ role: 'function', parts })
            continue
        }

        // Regular message
        const parts: Part[] = [{ text: m.content }]
        if (m.images && m.images.length > 0) {
            m.images.forEach(img => {
                const match = img.match(/^data:(image\/\w+);base64,(.+)$/)
                if (match) {
                    parts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    })
                }
            })
        }
        geminiHistory.push({
            role: m.role === 'user' ? 'user' : 'model',
            parts
        })
    }

    // Filter out any leading 'model' messages - Gemini requires first message to be 'user'
    const validHistory = geminiHistory.filter((m, i) => {
        if (i === 0 && m.role === 'model') return false
        return true
    })

    const lastMessage = messages[messages.length - 1]

    // Handle last message with tool results - send function responses
    let lastMessageParts: Part[]
    if (lastMessage?.toolResults && lastMessage.toolResults.length > 0) {
        lastMessageParts = lastMessage.toolResults.map(tr => ({
            functionResponse: {
                name: findToolName(messages, tr.toolCallId) || 'unknown',
                response: { result: tr.content }
            }
        }))
    } else {
        // Regular message - just text (and optionally images)
        lastMessageParts = [{ text: lastMessage?.content || '' }]
        if (lastMessage?.images && lastMessage.images.length > 0) {
            lastMessage.images.forEach(img => {
                const match = img.match(/^data:(image\/\w+);base64,(.+)$/)
                if (match) {
                    lastMessageParts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    })
                }
            })
        }
    }

    const chat = model.startChat({ history: validHistory })
    const result = await chat.sendMessage(lastMessageParts)

    // Extract function calls from response
    const functionCalls = result.response.functionCalls()
    const toolCalls: ToolCall[] | undefined = functionCalls?.map(fc => ({
        id: uuidv4(), // Gemini doesn't provide IDs, so we generate them
        name: fc.name,
        arguments: fc.args as Record<string, unknown>
    }))

    // Determine stop reason
    let stopReason: ChatResult['stopReason'] = 'end_turn'
    if (toolCalls && toolCalls.length > 0) {
        stopReason = 'tool_use'
    }

    // Get text content (may be empty if only function calls)
    let textContent = ''
    try {
        textContent = result.response.text()
    } catch {
        // text() throws if response only contains function calls
    }

    return {
        content: textContent,
        model: config.model,
        tokensInput: result.response.usageMetadata?.promptTokenCount || 0,
        tokensOutput: result.response.usageMetadata?.candidatesTokenCount || 0,
        stopReason,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined
    }
}

// Helper to convert JSON Schema to Gemini schema format
function convertToGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
        return { type: SchemaType.OBJECT }
    }

    const converted: Record<string, unknown> = {}

    if (schema.type === 'object') {
        converted.type = SchemaType.OBJECT
        if (schema.properties) {
            converted.properties = {}
            for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
                (converted.properties as Record<string, unknown>)[key] = convertPropertySchema(value as Record<string, unknown>)
            }
        }
        if (schema.required) {
            converted.required = schema.required
        }
    } else {
        converted.type = SchemaType.OBJECT
    }

    return converted
}

function convertPropertySchema(prop: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    switch (prop.type) {
        case 'string':
            result.type = SchemaType.STRING
            break
        case 'number':
        case 'integer':
            result.type = SchemaType.NUMBER
            break
        case 'boolean':
            result.type = SchemaType.BOOLEAN
            break
        case 'array':
            result.type = SchemaType.ARRAY
            if (prop.items) {
                result.items = convertPropertySchema(prop.items as Record<string, unknown>)
            }
            break
        case 'object':
            result.type = SchemaType.OBJECT
            if (prop.properties) {
                result.properties = {}
                for (const [key, value] of Object.entries(prop.properties as Record<string, unknown>)) {
                    (result.properties as Record<string, unknown>)[key] = convertPropertySchema(value as Record<string, unknown>)
                }
            }
            break
        default:
            result.type = SchemaType.STRING
    }

    if (prop.description) {
        result.description = prop.description
    }
    if (prop.enum) {
        result.enum = prop.enum
    }

    return result
}

// Helper to find tool name from a tool call ID by searching previous messages
function findToolName(messages: ChatMessage[], toolCallId: string): string | undefined {
    for (const m of messages) {
        if (m.toolCalls) {
            const tc = m.toolCalls.find(t => t.id === toolCallId)
            if (tc) return tc.name
        }
    }
    return undefined
}
