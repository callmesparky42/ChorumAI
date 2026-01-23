'use client'

import { useEffect, useState } from 'react'
import { Plus, ChevronDown, ChevronRight, Zap, Brain, Gauge, Copy, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useAgentStore } from '@/lib/agents/store'
import { AgentDefinition, AgentTier, TIER_INFO } from '@/lib/agents/types'
import { AgentCreatorModal } from './AgentCreatorModal'

interface Props {
  projectId?: string
}

export function AgentPanel({ projectId }: Props) {
  const {
    agents,
    activeAgent,
    setActiveAgent,
    initializeAgents,
    isCreatingAgent,
    isEditingAgent,
    editingAgentId,
    openCreateModal,
    closeCreateModal,
    openEditModal,
    closeEditModal,
    duplicateAgent,
    deleteAgent
  } = useAgentStore()

  const [expandedTiers, setExpandedTiers] = useState<Record<AgentTier, boolean>>({
    reasoning: true,
    balanced: true,
    fast: true
  })

  const [contextMenu, setContextMenu] = useState<{ agentId: string; x: number; y: number } | null>(null)

  // Initialize agents on mount
  useEffect(() => {
    initializeAgents()
  }, [initializeAgents])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const toggleTier = (tier: AgentTier) => {
    setExpandedTiers(prev => ({ ...prev, [tier]: !prev[tier] }))
  }

  const handleContextMenu = (e: React.MouseEvent, agentId: string) => {
    e.preventDefault()
    setContextMenu({ agentId, x: e.clientX, y: e.clientY })
  }

  const agentsByTier = {
    reasoning: agents.filter(a => a.tier === 'reasoning'),
    balanced: agents.filter(a => a.tier === 'balanced'),
    fast: agents.filter(a => a.tier === 'fast')
  }

  const tierIcons: Record<AgentTier, React.ReactNode> = {
    reasoning: <Brain className="w-3.5 h-3.5" />,
    balanced: <Gauge className="w-3.5 h-3.5" />,
    fast: <Zap className="w-3.5 h-3.5" />
  }

  const editingAgent = editingAgentId ? agents.find(a => a.id === editingAgentId) : null

  return (
    <>
      <div className="w-full bg-gray-950 border-l border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Agents</h2>
          <button
            onClick={openCreateModal}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Create custom agent"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Active Agent Display */}
        {activeAgent && (
          <div className="p-4 border-b border-gray-800 bg-gray-900/50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{activeAgent.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white text-sm truncate">{activeAgent.name}</p>
                <p className="text-xs text-gray-500 truncate">{activeAgent.role}</p>
              </div>
              <span className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium',
                TIER_INFO[activeAgent.tier].bgColor,
                TIER_INFO[activeAgent.tier].color
              )}>
                {TIER_INFO[activeAgent.tier].label}
              </span>
            </div>

            {/* Semantic Focus - The Key Feature */}
            <div className="mt-3 p-2.5 bg-gray-950 rounded-lg border border-gray-800">
              <p className="text-xs text-gray-500 mb-1">Semantic Focus</p>
              <p className="text-xs text-gray-300 italic">"{activeAgent.memory.semanticFocus}"</p>
            </div>
          </div>
        )}

        {/* Agent List by Tier */}
        <div className="flex-1 overflow-y-auto">
          {(['reasoning', 'balanced', 'fast'] as AgentTier[]).map((tier) => (
            <div key={tier} className="border-b border-gray-800/50">
              {/* Tier Header */}
              <button
                onClick={() => toggleTier(tier)}
                className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-900/50 transition-colors"
                title={TIER_INFO[tier].description}
              >
                {expandedTiers[tier] ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                )}
                <span className={clsx('flex items-center gap-1.5', TIER_INFO[tier].color)}>
                  {tierIcons[tier]}
                  <span className="text-xs font-medium uppercase tracking-wider">
                    {TIER_INFO[tier].label}
                  </span>
                </span>
                <span className="text-xs text-gray-600 ml-auto">
                  {agentsByTier[tier].length}
                </span>
              </button>

              {/* Agent Grid */}
              {expandedTiers[tier] && (
                <div className="p-2 grid grid-cols-2 gap-2">
                  {agentsByTier[tier].map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setActiveAgent(agent)}
                      onContextMenu={(e) => handleContextMenu(e, agent.id)}
                      className={clsx(
                        'flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-center gap-2 group relative',
                        activeAgent?.id === agent.id
                          ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                          : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:bg-gray-800 hover:border-gray-700 hover:text-gray-200'
                      )}
                      title={agent.role}
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform">{agent.icon}</span>
                      <p className="text-xs font-medium truncate w-full px-1">{agent.name}</p>

                      {/* Hover Info (Semantic Focus in tooltip effectively) */}
                      {agent.isCustom && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-purple-500" title="Custom Agent" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer with Create Button */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={openCreateModal}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Custom Agent
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              openEditModal(contextMenu.agentId)
              setContextMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => {
              duplicateAgent(contextMenu.agentId)
              setContextMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          {agents.find(a => a.id === contextMenu.agentId)?.isCustom && (
            <button
              onClick={() => {
                deleteAgent(contextMenu.agentId)
                setContextMenu(null)
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(isCreatingAgent || isEditingAgent) && (
        <AgentCreatorModal
          agent={editingAgent || undefined}
          onClose={() => {
            closeCreateModal()
            closeEditModal()
          }}
        />
      )}
    </>
  )
}
