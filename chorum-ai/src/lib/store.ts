import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    provider?: string
    costUsd?: string
    tokensInput?: number
    tokensOutput?: number
}

interface ChorumStore {
    messages: Message[]
    isLoading: boolean
    addMessage: (msg: Message) => void
    sendMessage: (params: { projectId: string; content: string; providerOverride?: string }) => Promise<void>
}

export const useChorumStore = create<ChorumStore>((set, get) => ({
    messages: [],
    isLoading: false,
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    sendMessage: async ({ projectId, content, providerOverride }) => {
        set({ isLoading: true })

        // Add user message immediately
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content
        }
        set((state) => ({ messages: [...state.messages, userMsg] }))

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, content, providerOverride })
            })

            if (!response.ok) {
                const errorText = await response.text()
                console.error('API Error:', errorText)
                try {
                    const errorJson = JSON.parse(errorText)
                    throw new Error(errorJson.error || 'Failed to send message')
                } catch (e: any) {
                    // Throw the original JSON error if we parsed it
                    if (e.message !== 'Unexpected token') throw e
                    throw new Error(`Failed to send message: ${response.status} ${response.statusText}`)
                }
            }

            const data = await response.json()

            // Add assistant message
            if (data.message) {
                set((state) => ({ messages: [...state.messages, data.message] }))
            }
        } catch (error) {
            console.error(error)
            // Ideally add error message to chat
        } finally {
            set({ isLoading: false })
        }
    }
}))
