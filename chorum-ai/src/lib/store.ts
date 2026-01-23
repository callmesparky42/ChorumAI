import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { AgentDefinition } from './agents/types'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    images?: string[] // base64 strings
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
    currentConversationId: string | null
    conversationRefreshTrigger: number // Increment to trigger sidebar refresh
    isAgentPanelOpen: boolean
    toggleAgentPanel: () => void
    addMessage: (msg: Message) => void
    sendMessage: (params: {
        projectId: string
        content: string
        images?: string[]
        providerOverride?: string
        agentOverride?: string  // Agent ID to force, or 'auto' for orchestrator selection
    }) => Promise<void>
    loadConversation: (conversationId: string) => Promise<void>
    clearMessages: () => void
    startNewConversation: () => void
    triggerConversationRefresh: () => void

    // Settings
    settings: {
        showCost: boolean
    }
    updateSettings: (settings: Partial<ChorumStore['settings']>) => void
}

export const useChorumStore = create<ChorumStore>((set, get) => ({
    // Default Settings
    settings: {
        showCost: false
    },
    updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
    })),

    messages: [],
    isLoading: false,
    currentConversationId: null,
    conversationRefreshTrigger: 0,
    isAgentPanelOpen: false, // Closed by default per "Sovereign Minimalism"
    toggleAgentPanel: () => set((state) => ({ isAgentPanelOpen: !state.isAgentPanelOpen })),
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    clearMessages: () => set({ messages: [], currentConversationId: null }),
    startNewConversation: () => set({ messages: [], currentConversationId: null }),
    triggerConversationRefresh: () => set((state) => ({
        conversationRefreshTrigger: state.conversationRefreshTrigger + 1
    })),
    loadConversation: async (conversationId: string) => {
        set({ isLoading: true })
        try {
            const response = await fetch(`/api/conversations/${conversationId}/messages`)
            if (!response.ok) {
                throw new Error('Failed to load conversation')
            }
            const data = await response.json()

            // Transform messages to our format
            const loadedMessages: Message[] = data.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                provider: msg.provider,
                costUsd: msg.costUsd,
                tokensInput: msg.tokensInput,
                tokensOutput: msg.tokensOutput
            }))

            set({
                messages: loadedMessages,
                currentConversationId: conversationId
            })
        } catch (error) {
            console.error('Failed to load conversation:', error)
        } finally {
            set({ isLoading: false })
        }
    },
    sendMessage: async ({ projectId, content, images, providerOverride, agentOverride }) => {
        set({ isLoading: true })

        // Add user message immediately
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content,
            images
        }
        set((state) => ({ messages: [...state.messages, userMsg] }))

        try {
            // Build request with agent context and conversation ID
            const { currentConversationId } = get()
            const requestBody: Record<string, unknown> = {
                projectId,
                conversationId: currentConversationId,
                content,
                images,
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

            // Update conversation ID if this was a new conversation
            if (data.conversation?.isNew && data.conversation?.id) {
                set({ currentConversationId: data.conversation.id })
                // Trigger sidebar refresh for new conversations
                set((state) => ({
                    conversationRefreshTrigger: state.conversationRefreshTrigger + 1
                }))
            }

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
