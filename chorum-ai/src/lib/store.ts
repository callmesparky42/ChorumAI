import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { AgentDefinition } from './agents/types'
import type { Attachment } from './chat/types'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    images?: string[] // base64 strings
    attachments?: Attachment[]
    provider?: string
    model?: string
    costUsd?: string
    tokensInput?: number
    tokensOutput?: number
    agentName?: string
    agentIcon?: string
    agentTier?: 'reasoning' | 'balanced' | 'fast'
    createdAt?: string
}

interface Project {
    id: string
    name: string
    description?: string
    techStack?: string[]
    customInstructions?: string
}

interface Conversation {
    id: string
    title: string
    preview: string | null
    messageCount: number
    createdAt: string
    updatedAt: string
}

interface ChorumStore {
    // Navigation Data
    projects: Project[]
    conversations: Record<string, Conversation[]> // projectId -> conversations
    isProjectsLoading: boolean
    isConversationsLoading: Record<string, boolean> // projectId -> loading state

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
        attachments?: Attachment[]
        providerOverride?: string
        agentOverride?: string  // Agent ID to force, or 'auto' for orchestrator selection
    }) => Promise<void>
    loadConversation: (conversationId: string) => Promise<void>
    clearMessages: () => void
    startNewConversation: () => void
    triggerConversationRefresh: () => void

    // Actions for Navigation Data
    fetchProjects: (force?: boolean) => Promise<void>
    fetchConversations: (projectId: string, force?: boolean) => Promise<void>
    deleteProject: (projectId: string) => Promise<void>
    deleteConversation: (conversationId: string) => Promise<void>

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

    // Navigation Data
    projects: [],
    conversations: {},
    isProjectsLoading: false,
    isConversationsLoading: {},

    messages: [],
    isLoading: false,
    currentConversationId: null,
    conversationRefreshTrigger: 0,
    isAgentPanelOpen: false, // Closed by default per "Sovereign Minimalism"
    toggleAgentPanel: () => set((state) => ({ isAgentPanelOpen: !state.isAgentPanelOpen })),
    addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
    clearMessages: () => set({ messages: [], currentConversationId: null }),
    startNewConversation: () => set({ messages: [], currentConversationId: null }),
    triggerConversationRefresh: () => {
        const { currentConversationId, projects } = get()
        set((state) => ({
            conversationRefreshTrigger: state.conversationRefreshTrigger + 1
        }))
        // Background refresh all projects and their conversations
        get().fetchProjects(true)
        projects.forEach(p => get().fetchConversations(p.id, true))
    },

    fetchProjects: async (force = false) => {
        const { projects, isProjectsLoading } = get()
        if (!force && projects.length > 0) return
        if (isProjectsLoading) return

        set({ isProjectsLoading: true })
        try {
            const res = await fetch('/api/projects')
            if (res.ok) {
                const data = await res.json()
                set({ projects: data })
            }
        } catch (error) {
            console.error('Failed to fetch projects:', error)
        } finally {
            set({ isProjectsLoading: false })
        }
    },

    fetchConversations: async (projectId: string, force = false) => {
        const { conversations, isConversationsLoading } = get()
        if (!force && conversations[projectId]?.length > 0) return
        if (isConversationsLoading[projectId]) return

        set((state) => ({
            isConversationsLoading: { ...state.isConversationsLoading, [projectId]: true }
        }))
        try {
            const res = await fetch(`/api/conversations?projectId=${projectId}`)
            if (res.ok) {
                const data = await res.json()
                set((state) => ({
                    conversations: { ...state.conversations, [projectId]: data }
                }))
            }
        } catch (error) {
            console.error(`Failed to fetch conversations for project ${projectId}:`, error)
        } finally {
            set((state) => ({
                isConversationsLoading: { ...state.isConversationsLoading, [projectId]: false }
            }))
        }
    },

    deleteProject: async (projectId: string) => {
        try {
            const res = await fetch(`/api/projects?id=${projectId}`, { method: 'DELETE' })
            if (res.ok) {
                set((state) => ({
                    projects: state.projects.filter(p => p.id !== projectId),
                    conversations: { ...state.conversations, [projectId]: [] }
                }))
            } else {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to delete project')
            }
        } catch (error) {
            console.error('Failed to delete project:', error)
            throw error
        }
    },

    deleteConversation: async (conversationId: string) => {
        try {
            const res = await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' })
            if (res.ok) {
                // Find which project this conversation belonged to and refresh it
                // Sinceเรา don't easily know the projectId from the ID alone without scanning, 
                // we'll just trigger a global refresh or the user can scan the state
                set((state) => {
                    const newConversations = { ...state.conversations }
                    Object.keys(newConversations).forEach(pkgId => {
                        newConversations[pkgId] = newConversations[pkgId].filter(c => c.id !== conversationId)
                    })
                    return { conversations: newConversations }
                })
            } else {
                throw new Error('Failed to delete conversation')
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error)
            throw error
        }
    },
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
                model: msg.model,
                costUsd: msg.costUsd,
                tokensInput: msg.tokensInput,
                tokensOutput: msg.tokensOutput,
                createdAt: msg.createdAt
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
    sendMessage: async ({ projectId, content, images, attachments, providerOverride, agentOverride }) => {
        set({ isLoading: true })

        // Add user message immediately
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content,
            images,
            attachments,
            createdAt: new Date().toISOString()
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
                attachments,
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

                let errorMessage = `Failed to send message: ${response.status} ${response.statusText}`
                try {
                    const errorJson = JSON.parse(errorText)
                    if (errorJson.error) errorMessage = errorJson.error
                } catch (e) {
                    // Fallback to default error if JSON parse fails
                }

                throw new Error(errorMessage)
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
                    agentIcon: data.agent?.icon,
                    agentTier: data.agent?.tier,
                    model: data.message.model,
                    createdAt: data.message.createdAt || new Date().toISOString()
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
