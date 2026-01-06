import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AgentDefinition, BUILT_IN_AGENTS, AGENT_TEMPLATE } from './types'
import { v4 as uuidv4 } from 'uuid'

interface AgentStore {
  // All agents (built-in + custom)
  agents: AgentDefinition[]

  // Currently selected agent
  activeAgent: AgentDefinition | null

  // UI state
  isCreatingAgent: boolean
  isEditingAgent: boolean
  editingAgentId: string | null

  // Actions
  setActiveAgent: (agent: AgentDefinition | null) => void
  createAgent: (agent: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'>) => AgentDefinition
  updateAgent: (id: string, updates: Partial<AgentDefinition>) => void
  deleteAgent: (id: string) => void
  duplicateAgent: (id: string) => AgentDefinition | null

  // UI actions
  openCreateModal: () => void
  closeCreateModal: () => void
  openEditModal: (id: string) => void
  closeEditModal: () => void

  // Initialize built-in agents
  initializeAgents: () => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      agents: [],
      activeAgent: null,
      isCreatingAgent: false,
      isEditingAgent: false,
      editingAgentId: null,

      setActiveAgent: (agent) => set({ activeAgent: agent }),

      createAgent: (agentData) => {
        const newAgent: AgentDefinition = {
          ...agentData,
          id: uuidv4(),
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          agents: [...state.agents, newAgent],
          isCreatingAgent: false
        }))

        // Auto-save to .chorum/agents/ (via API)
        saveAgentToFile(newAgent)

        return newAgent
      },

      updateAgent: (id, updates) => {
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === id
              ? { ...agent, ...updates, updatedAt: new Date().toISOString() }
              : agent
          )
        }))

        // Auto-save updated agent
        const agent = get().agents.find(a => a.id === id)
        if (agent && agent.isCustom) {
          saveAgentToFile(agent)
        }
      },

      deleteAgent: (id) => {
        const agent = get().agents.find(a => a.id === id)

        // Cannot delete built-in agents
        if (agent?.isBuiltIn) return

        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
          activeAgent: state.activeAgent?.id === id ? null : state.activeAgent
        }))

        // Delete from file system (via API)
        if (agent) {
          deleteAgentFile(agent.name)
        }
      },

      duplicateAgent: (id) => {
        const agent = get().agents.find(a => a.id === id)
        if (!agent) return null

        const duplicate: AgentDefinition = {
          ...agent,
          id: uuidv4(),
          name: `${agent.name} (Copy)`,
          isBuiltIn: false,
          isCustom: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        set((state) => ({
          agents: [...state.agents, duplicate]
        }))

        saveAgentToFile(duplicate)

        return duplicate
      },

      openCreateModal: () => set({ isCreatingAgent: true }),
      closeCreateModal: () => set({ isCreatingAgent: false }),

      openEditModal: (id) => set({ isEditingAgent: true, editingAgentId: id }),
      closeEditModal: () => set({ isEditingAgent: false, editingAgentId: null }),

      initializeAgents: () => {
        const existingAgents = get().agents
        const builtInIds = existingAgents.filter(a => a.isBuiltIn).map(a => a.name)

        // Add any missing built-in agents
        const missingBuiltIns = BUILT_IN_AGENTS.filter(
          (agent) => !builtInIds.includes(agent.name)
        ).map((agent) => ({
          ...agent,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))

        if (missingBuiltIns.length > 0) {
          set((state) => ({
            agents: [...missingBuiltIns, ...state.agents]
          }))
        }

        // Set default active agent if none selected
        if (!get().activeAgent && get().agents.length > 0) {
          // Default to Analyst (reasoning tier)
          const defaultAgent = get().agents.find(a => a.name === 'Analyst') || get().agents[0]
          set({ activeAgent: defaultAgent })
        }
      }
    }),
    {
      name: 'chorum-agents',
      partialize: (state) => ({
        agents: state.agents.filter(a => a.isCustom), // Only persist custom agents
        activeAgent: state.activeAgent
      })
    }
  )
)

// Helper functions for file persistence
async function saveAgentToFile(agent: AgentDefinition) {
  try {
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent)
    })
  } catch (error) {
    console.error('Failed to save agent to file:', error)
  }
}

async function deleteAgentFile(agentName: string) {
  try {
    await fetch(`/api/agents/${encodeURIComponent(agentName)}`, {
      method: 'DELETE'
    })
  } catch (error) {
    console.error('Failed to delete agent file:', error)
  }
}

// Export template for use in UI
export { AGENT_TEMPLATE }
