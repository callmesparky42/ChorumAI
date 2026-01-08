import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessage, ChatResult, ProviderCallConfig } from './types'

export async function callGoogle(
    config: ProviderCallConfig,
    messages: ChatMessage[],
    systemPrompt: string
): Promise<ChatResult> {
    const genAI = new GoogleGenerativeAI(config.apiKey)

    const model = genAI.getGenerativeModel({
        model: config.model,
        systemInstruction: systemPrompt
    })

    // Convert to Gemini format
    // Important: Gemini requires history to START with a 'user' role message
    const geminiHistory = messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }))

    // Filter out any leading 'model' messages - Gemini requires first message to be 'user'
    const validHistory = geminiHistory.filter((m, i) => {
        if (i === 0 && m.role === 'model') return false
        return true
    })

    const lastMessage = messages[messages.length - 1]
    const chat = model.startChat({ history: validHistory as any })
    const result = await chat.sendMessage(lastMessage?.content || '')

    return {
        content: result.response.text(),
        tokensInput: result.response.usageMetadata?.promptTokenCount || 0,
        tokensOutput: result.response.usageMetadata?.candidatesTokenCount || 0
    }
}
