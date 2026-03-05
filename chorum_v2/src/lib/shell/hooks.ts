'use client'

import { useState, useCallback } from 'react'
import {
    startChatSession,
    sendChatMessage,
    submitFeedback as submitFeedbackAction,
    getConversationHistory,
    getConversationMessages,
    saveConversationMessages,
    endChatSession
} from './actions'
import type { AgentChatResult } from '@/lib/agents/types'
import type { OmnibarAttachment } from '@/components/shell/Omnibar'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ConversationSummary = { id: string; updated_at: string; metadata: any }

export interface InjectedItem {
    id: string
    type: string
    content: string
    score: number
}

export interface StreamMeta {
    tokensUsed: number
    model: string
    agentUsed: string
    conversationId: string
}

function parseContextToItems(raw: string): InjectedItem[] {
    return raw.split('\n\n').filter(Boolean).map((item, i) => {
        const lines = item.split('\n')
        const firstLine = lines[0] || ''
        const typeMatch = firstLine.match(/\[(.*?)\]/)
        return {
            id: String(i),
            type: typeMatch?.[1] ?? 'item',
            content: firstLine.replace(/\[.*?\]\s*/, ''),
            score: 0,
        }
    })
}

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [injectedContext, setInjectedContext] = useState<InjectedItem[]>([])
    const [rawContext, setRawContext] = useState<string>('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [isLoadingConversation, setIsLoadingConversation] = useState(false)
    const [conversationId, setConversationId] = useState<string>('')
    const [activePersona, setActivePersona] = useState<string>('')
    const [conversations, setConversations] = useState<ConversationSummary[]>([])
    const [resultMeta, setResultMeta] = useState<StreamMeta | null>(null)
    const [streamError, setStreamError] = useState<string | null>(null)
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

    const loadConversations = useCallback(async () => {
        const list = await getConversationHistory(20)
        setConversations(list)
    }, [])

    const loadConversation = useCallback(async (id: string) => {
        setIsLoadingConversation(true)
        const history = await getConversationMessages(id)
        setMessages(history)
        setConversationId(id)
        setInjectedContext([])
        setRawContext('')
        setResultMeta(null)
        setStreamError(null)
        setIsLoadingConversation(false)
    }, [])

    const newConversation = useCallback(async (initialText?: string, projectId?: string) => {
        if (conversationId) {
            await endChatSession(conversationId).catch(() => { })
        }
        const res = await startChatSession(initialText || '', projectId)
        setConversationId(res.conversationId)
        setMessages([])
        setInjectedContext([])
        setRawContext('')
        setResultMeta(null)
        setStreamError(null)
        loadConversations()
        return res.conversationId
    }, [conversationId, loadConversations])

    const sendMessage = useCallback(async (content: string, attachments: OmnibarAttachment[] = []) => {
        setIsStreaming(true)
        setStreamError(null)

        let cid = conversationId
        if (!cid) {
            cid = await newConversation(content)
        }

        const currentHistory = [...messages]
        const newMessages: ChatMessage[] = [...currentHistory, { role: 'user', content }]
        setMessages(newMessages)
        await saveConversationMessages(cid, newMessages)

        // Try SSE streaming
        let streamSucceeded = false
        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: cid,
                    message: content,
                    personaId: activePersona || undefined,
                    selectedProvider: selectedProvider || undefined,
                    history: currentHistory,
                    attachments,
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const reader = response.body?.getReader()
            if (!reader) throw new Error('No response body')

            const dec = new TextDecoder()
            let assistantContent = ''
            let buf = ''

            // Add placeholder assistant message
            setMessages(prev => [...prev, { role: 'assistant', content: '' }])

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buf += dec.decode(value, { stream: true })
                const parts = buf.split('\n\n')
                buf = parts.pop() ?? ''

                for (const part of parts) {
                    const line = part.trim()
                    if (!line.startsWith('data: ')) continue
                    let event: any
                    try { event = JSON.parse(line.slice(6)) } catch { continue }

                    if (event.type === 'context') {
                        setInjectedContext(event.items ?? [])
                    } else if (event.type === 'token') {
                        assistantContent += event.token
                        setMessages(prev => {
                            const updated = [...prev]
                            updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
                            return updated
                        })
                    } else if (event.type === 'meta') {
                        setResultMeta(event.meta)
                    } else if (event.type === 'error') {
                        setStreamError(event.message)
                    } else if (event.type === 'done') {
                        // finalize
                    }
                }
            }

            const finalMessages: ChatMessage[] = [...newMessages, { role: 'assistant', content: assistantContent }]
            await saveConversationMessages(cid, finalMessages)
            await loadConversations()
            streamSucceeded = true
        } catch (err) {
            console.warn('Streaming failed, falling back to sync:', err)
        }

        // Fallback to sync if streaming failed
        if (!streamSucceeded) {
            try {
                const res = await sendChatMessage(cid, content, activePersona || undefined, currentHistory)
                const assistantMessage: ChatMessage = { role: 'assistant', content: res.response }
                const finalMessages = [...newMessages, assistantMessage]
                setMessages(finalMessages)
                await saveConversationMessages(cid, finalMessages)
                setResultMeta({
                    tokensUsed: res.tokensUsed,
                    model: res.model,
                    agentUsed: typeof res.agentUsed === 'string' ? res.agentUsed : (res.agentUsed?.name ?? ''),
                    conversationId: res.conversationId,
                })
                setRawContext(res.injectedContext)
                setInjectedContext(parseContextToItems(res.injectedContext))
                await loadConversations()
            } catch (e) {
                setStreamError(e instanceof Error ? e.message : 'Unknown error')
            }
        }

        setIsStreaming(false)
    }, [conversationId, messages, activePersona, selectedProvider, newConversation, loadConversations])

    const submitFeedback = useCallback(async (learningId: string, signal: 'positive' | 'negative') => {
        return submitFeedbackAction(learningId, signal, conversationId)
    }, [conversationId])

    return {
        messages,
        isStreaming,
        isLoadingConversation,
        conversationId,
        activePersona,
        setActivePersona,
        sendMessage,
        submitFeedback,
        conversations,
        loadConversations,
        loadConversation,
        newConversation,
        injectedContext,
        rawContext,
        resultMeta,
        streamError,
        selectedProvider,
        setSelectedProvider,
    }
}
