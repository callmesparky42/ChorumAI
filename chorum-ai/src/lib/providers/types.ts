/**
 * Shared types for provider implementations
 */

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    images?: string[] // base64 data URLs
}

export interface ChatResult {
    content: string
    tokensInput: number
    tokensOutput: number
}

export interface SecuritySettings {
    enforceHttps: boolean
    anonymizePii: boolean
    strictSsl: boolean
    logAllRequests: boolean
}

export interface ProviderCallConfig {
    apiKey: string
    model: string
    baseUrl?: string
    isLocal?: boolean
    /** Security settings for TLS/SSL configuration */
    securitySettings?: SecuritySettings | null
}
