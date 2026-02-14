export type NormalizedRole = 'user' | 'assistant'

export interface NormalizedMessage {
    role: NormalizedRole
    content: string
    createdAt?: string | null
    provider?: string | null
}

export interface NormalizedConversation {
    title?: string | null
    createdAt?: string | null
    updatedAt?: string | null
    messages: NormalizedMessage[]
}

export interface ParseResult {
    format: 'chatgpt' | 'claude' | 'generic' | 'chorum' | 'unknown'
    conversations: NormalizedConversation[]
    warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function toIsoTimestamp(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (value instanceof Date) return value.toISOString()

    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1_000_000_000_000 ? value : value * 1000
        const date = new Date(ms)
        return Number.isNaN(date.getTime()) ? null : date.toISOString()
    }

    if (typeof value === 'string') {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? null : date.toISOString()
    }

    return null
}

function normalizeText(value: unknown): string {
    if (typeof value === 'string') return value.trim()
    if (Array.isArray(value)) {
        return value.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join('\n').trim()
    }
    if (isRecord(value)) {
        if (typeof value.text === 'string') return value.text.trim()
        if (Array.isArray(value.parts)) {
            return value.parts.map(part => typeof part === 'string' ? part : JSON.stringify(part)).join('\n').trim()
        }
        if (typeof value.content === 'string') return value.content.trim()
    }
    return ''
}

function normalizeRole(role: unknown): NormalizedRole | null {
    if (typeof role !== 'string') return null
    const lower = role.toLowerCase()
    if (lower === 'user' || lower === 'human') return 'user'
    if (lower === 'assistant' || lower === 'ai' || lower === 'bot') return 'assistant'
    return null
}

function normalizeMessages(rawMessages: unknown[], warnings: string[]): NormalizedMessage[] {
    const messages: NormalizedMessage[] = []

    for (const msg of rawMessages) {
        if (!isRecord(msg)) continue
        const role = normalizeRole(msg.role ?? msg.author ?? msg.sender)
        if (!role) continue

        const content = normalizeText(msg.content ?? msg.text ?? msg.message ?? msg.body ?? msg.data)
        if (!content) continue

        messages.push({
            role,
            content,
            createdAt: toIsoTimestamp(msg.createdAt ?? msg.created_at ?? msg.timestamp ?? msg.time),
            provider: typeof msg.provider === 'string' ? msg.provider : null
        })
    }

    if (messages.length === 0) {
        warnings.push('No valid messages found in conversation.')
    }

    return messages
}

function parseChatGptExport(data: Record<string, unknown>): ParseResult {
    const warnings: string[] = []
    const rawConversations = Array.isArray(data.conversations) ? data.conversations : []
    const conversations: NormalizedConversation[] = []

    for (const convo of rawConversations) {
        if (!isRecord(convo)) continue
        const mapping = isRecord(convo.mapping) ? convo.mapping : {}
        const nodes = Object.values(mapping)
        const messages: NormalizedMessage[] = []

        for (const node of nodes) {
            if (!isRecord(node)) continue
            const message = isRecord(node.message) ? node.message : null
            if (!message) continue
            const author = isRecord(message.author) ? message.author : null
            const role = normalizeRole(author?.role)
            if (!role) continue
            const contentObj = message.content
            const content = normalizeText(contentObj)
            if (!content) continue

            messages.push({
                role,
                content,
                createdAt: toIsoTimestamp(message.create_time ?? message.created_at ?? node.create_time),
                provider: typeof message.model === 'string' ? message.model : null
            })
        }

        messages.sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return aTime - bTime
        })

        if (messages.length === 0) {
            warnings.push('Skipped a ChatGPT conversation with no usable messages.')
            continue
        }

        conversations.push({
            title: typeof convo.title === 'string' ? convo.title : null,
            createdAt: toIsoTimestamp(convo.create_time ?? convo.created_at),
            updatedAt: toIsoTimestamp(convo.update_time ?? convo.updated_at),
            messages
        })
    }

    return { format: 'chatgpt', conversations, warnings }
}

function parseClaudeExport(data: Record<string, unknown>): ParseResult {
    const warnings: string[] = []
    const conversations: NormalizedConversation[] = []

    const rawConversations = Array.isArray(data.conversations) ? data.conversations : []

    for (const convo of rawConversations) {
        if (!isRecord(convo)) continue
        const rawMessages = Array.isArray(convo.chat_messages)
            ? convo.chat_messages
            : Array.isArray(convo.messages)
                ? convo.messages
                : []
        const messages = normalizeMessages(rawMessages, warnings)
        if (messages.length === 0) continue

        conversations.push({
            title: typeof convo.title === 'string' ? convo.title : (typeof convo.name === 'string' ? convo.name : null),
            createdAt: toIsoTimestamp(convo.createdAt ?? convo.created_at),
            updatedAt: toIsoTimestamp(convo.updatedAt ?? convo.updated_at),
            messages
        })
    }

    return { format: 'claude', conversations, warnings }
}

function parseGenericExport(data: unknown): ParseResult {
    const warnings: string[] = []
    const conversations: NormalizedConversation[] = []

    if (Array.isArray(data)) {
        const looksLikeMessage = data.length > 0 && isRecord(data[0]) && ('role' in data[0] || 'content' in data[0])
        const looksLikeConversation = data.length > 0 && isRecord(data[0]) && 'messages' in data[0]

        if (looksLikeConversation) {
            for (const convo of data) {
                if (!isRecord(convo)) continue
                const rawMessages = Array.isArray(convo.messages) ? convo.messages : []
                const messages = normalizeMessages(rawMessages, warnings)
                if (messages.length === 0) continue

                conversations.push({
                    title: typeof convo.title === 'string' ? convo.title : null,
                    createdAt: toIsoTimestamp(convo.createdAt ?? convo.created_at),
                    updatedAt: toIsoTimestamp(convo.updatedAt ?? convo.updated_at),
                    messages
                })
            }
        } else if (looksLikeMessage) {
            const messages = normalizeMessages(data, warnings)
            if (messages.length > 0) {
                conversations.push({ title: null, createdAt: null, updatedAt: null, messages })
            }
        }
    } else if (isRecord(data) && Array.isArray(data.messages)) {
        const messages = normalizeMessages(data.messages, warnings)
        if (messages.length > 0) {
            conversations.push({
                title: typeof data.title === 'string' ? data.title : null,
                createdAt: toIsoTimestamp(data.createdAt ?? data.created_at),
                updatedAt: toIsoTimestamp(data.updatedAt ?? data.updated_at),
                messages
            })
        }
    }

    return { format: 'generic', conversations, warnings }
}

export function parseConversationExport(data: unknown): ParseResult {
    if (!isRecord(data)) {
        return { format: 'unknown', conversations: [], warnings: ['Unsupported export format.'] }
    }

    if (isRecord(data.metadata) && isRecord(data.project)) {
        return { format: 'chorum', conversations: [], warnings: [] }
    }

    if (Array.isArray(data.conversations)) {
        const hasMapping = data.conversations.some(c => isRecord(c) && isRecord(c.mapping))
        if (hasMapping) {
            return parseChatGptExport(data)
        }
        const hasChatMessages = data.conversations.some(c => isRecord(c) && Array.isArray(c.chat_messages))
        if (hasChatMessages) {
            return parseClaudeExport(data)
        }
        return parseGenericExport(data)
    }

    if (Array.isArray(data.chat_messages) || Array.isArray(data.messages)) {
        const result = parseClaudeExport({ conversations: [data] })
        if (result.conversations.length > 0) return result
    }

    return parseGenericExport(data)
}

import { parseTextConversation } from './textParser'
import { ImportPayload } from './intake'

export function parseImport(payload: ImportPayload): ParseResult {
    if (payload.type === 'json' && payload.data) {
        return parseConversationExport(payload.data)
    }

    if (payload.type === 'text' && payload.text) {
        return parseTextConversation(payload.text, payload.hint)
    }

    return {
        format: 'unknown',
        conversations: [],
        warnings: ['Invalid import payload']
    }
}
