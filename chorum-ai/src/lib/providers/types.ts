/**
 * Shared types for provider implementations
 */

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export interface ChatResult {
    content: string
    tokensInput: number
    tokensOutput: number
}

export interface ProviderCallConfig {
    apiKey: string
    model: string
    baseUrl?: string
    isLocal?: boolean
}
