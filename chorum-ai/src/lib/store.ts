import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { AgentDefinition } from './agents/types'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    provider?: string
    costUsd?: string
    tokensInput?: number
    tokensOutput?: number
    agentName?: string
    agentIcon?: string
}

interface ChorumStore {
    messages: Message[]
    isLoading: boolean
    addMessage: (msg: Message) => void
    sendMessage: (params: {
        projectId: string
        content: string
        providerOverride?: string
        agentOverride?: string  // Agent ID to force, or 'auto' for orchestrator selection
    }) => Promise<void>
    clearMessages: () => void
}

export const useChorumStore = create<ChorumStore>((set, get) => ({
    messages: [],
    isLoading: false,
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    clearMessages: () => set({ messages: [] }),
    sendMessage: async ({ projectId, content, providerOverride, agentOverride }) => {
        set({ isLoading: true })

        // Add user message immediately
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content
        }
        set((state) => ({ messages: [...state.messages, userMsg] }))

        try {
            // Build request with agent context
            const requestBody: Record<string, unknown> = {
                projectId,
                content,
                providerOverride,
                agentOverride: agentOverride === 'auto' ? undefined : agentOverride
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('API Error:', errorText)
                try {
                    const errorJson = JSON.parse(errorText)
                    throw new Error(errorJson.error || 'Failed to send message')
                } catch (e: any) {
                    if (e.message !== 'Unexpected token') throw e
                    throw new Error(`Failed to send message: ${response.status} ${response.statusText}`)
                }
            }

            const data = await response.json()

            // Add assistant message with agent info from API (orchestrator-selected)
            if (data.message) {
                const assistantMsg: Message = {
                    ...data.message,
                    // Use agent from API response (orchestrator's choice) if available
                    agentName: data.agent?.name,
                    agentIcon: data.agent?.icon
                }
                set((state) => ({ messages: [...state.messages, assistantMsg] }))
            }
        } catch (error) {
            console.error(error)
            // Add error message to chat
            const errorMsg: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`
            }
            set((state) => ({ messages: [...state.messages, errorMsg] }))
        } finally {
            set({ isLoading: false })
        }
    }
}))
