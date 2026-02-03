/**
 * Shared types for provider implementations
 */

// --- Tool Calling Types ---

export interface ToolDefinition {
    name: string
    description?: string
    inputSchema: Record<string, unknown>
}

export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, unknown>
}

export interface ToolResult {
    toolCallId: string
    content: string
    isError?: boolean
}

// --- Message Types ---

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    images?: string[] // base64 data URLs
    attachments?: {
        type: 'image' | 'text' | 'code' | 'markdown' | 'json' | 'pdf';
        name: string;
        content: string;
        mimeType: string;
    }[]
    // Tool calling support
    toolCalls?: ToolCall[]      // For assistant messages that invoke tools
    toolResults?: ToolResult[]  // For user messages returning tool results
}

export interface ChatResult {
    content: string
    tokensInput: number
    tokensOutput: number
    // Tool calling support
    stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
    toolCalls?: ToolCall[]
    images?: string[]
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
    /** Tools available for this call */
    tools?: ToolDefinition[]
    /** How the model should choose tools */
    toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string }
}
