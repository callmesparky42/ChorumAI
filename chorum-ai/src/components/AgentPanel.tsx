'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useAgentStore } from '@/lib/agents/store'
import { AgentDefinition, AgentTier, TIER_INFO } from '@/lib/agents/types'
import { AgentCreatorModal } from './AgentCreatorModal'
import { HyggeButton } from '@/components/hygge/HyggeButton'

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

  const editingAgent = editingAgentId ? agents.find(a => a.id === editingAgentId) : null
  const activeAgentParams = useMemo(() => {
    if (!activeAgent) return null
    return {
      focus: activeAgent.memory.semanticFocus,
      temperature: activeAgent.model.temperature,
      maxTokens: activeAgent.model.maxTokens,
      reasoning: activeAgent.model.reasoningMode ? 'on' : 'off',
      tools: activeAgent.capabilities.tools?.length || 0,
      writesBack: activeAgent.memory.writesBack?.join(', ') || 'none'
    }
  }, [activeAgent])

  return (
    <>
      <div className="w-full bg-[var(--hg-bg)] border-l border-[var(--hg-border)] flex flex-col min-h-0 h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--hg-border)] flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[var(--hg-text-tertiary)] uppercase tracking-wider">Agents</h2>
          <HyggeButton
            onClick={openCreateModal}
            className="text-xs"
            title="Create custom agent"
          >
            create
          </HyggeButton>
        </div>

        {/* Active Agent Display */}
        {activeAgent && activeAgentParams && (
          <div className="p-4 border-b border-[var(--hg-border)] bg-[var(--hg-surface)] space-y-3">
            <div className="flex items-center gap-3">
              <div className="text-xs uppercase tracking-wider text-[var(--hg-text-tertiary)]">
                {TIER_INFO[activeAgent.tier].label}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--hg-text-primary)] text-sm truncate">{activeAgent.name}</p>
                <p className="text-xs text-[var(--hg-text-tertiary)] truncate">{activeAgent.role}</p>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="hg-stat-line">
                <span className="hg-label">semantic focus</span>
                <span className="hg-fill" />
                <span className="hg-value">"{activeAgentParams.focus}"</span>
              </div>
              <div className="hg-stat-line">
                <span className="hg-label">temperature</span>
                <span className="hg-fill" />
                <span className="hg-value">{activeAgentParams.temperature.toFixed(2)}</span>
              </div>
              <div className="hg-stat-line">
                <span className="hg-label">max tokens</span>
                <span className="hg-fill" />
                <span className="hg-value">{activeAgentParams.maxTokens}</span>
              </div>
              <div className="hg-stat-line">
                <span className="hg-label">reasoning</span>
                <span className="hg-fill" />
                <span className="hg-value">{activeAgentParams.reasoning}</span>
              </div>
              <div className="hg-stat-line">
                <span className="hg-label">tools</span>
                <span className="hg-fill" />
                <span className="hg-value">{activeAgentParams.tools}</span>
              </div>
              <div className="hg-stat-line">
                <span className="hg-label">writes back</span>
                <span className="hg-fill" />
                <span className="hg-value">{activeAgentParams.writesBack}</span>
              </div>
            </div>
          </div>
        )}

        {/* Agent List by Tier */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {(['reasoning', 'balanced', 'fast'] as AgentTier[]).map((tier) => (
            <div key={tier} className="border-b border-[var(--hg-border)]">
              {/* Tier Header */}
              <button
                onClick={() => toggleTier(tier)}
                className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-[var(--hg-surface-hover)] transition-colors"
                title={TIER_INFO[tier].description}
              >
                {expandedTiers[tier] ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
                )}
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--hg-text-secondary)]">
                  {TIER_INFO[tier].label}
                </span>
                <span className="text-xs text-[var(--hg-text-tertiary)] ml-auto">
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
                        'flex flex-col items-start justify-start p-3 border transition-colors text-left gap-2 group relative',
                        activeAgent?.id === agent.id
                          ? 'bg-[var(--hg-accent-muted)] border-[var(--hg-accent)] text-[var(--hg-text-primary)]'
                          : 'bg-[var(--hg-surface)] border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:border-[var(--hg-border-subtle)]'
                      )}
                      title={agent.role}
                    >
                      <div className="text-xs font-medium uppercase tracking-wider text-[var(--hg-text-tertiary)]">
                        {agent.tier}
                      </div>
                      <p className="text-sm font-medium truncate w-full">{agent.name}</p>
                      <p className="text-xs text-[var(--hg-text-tertiary)] line-clamp-2">{agent.role}</p>
                      <div className="text-xs text-[var(--hg-text-tertiary)]">
                        focus: “{agent.memory.semanticFocus}”
                      </div>
                      <div className="text-xs text-[var(--hg-text-tertiary)]">
                        temp {agent.model.temperature.toFixed(2)} · {agent.capabilities.tools.length} tools
                      </div>
                      {agent.isCustom && (
                        <span className="absolute top-1 right-1 text-[10px] text-[var(--hg-accent)]">custom</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[var(--hg-bg)] border border-[var(--hg-border)] py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              openEditModal(contextMenu.agentId)
              setContextMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] flex items-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => {
              duplicateAgent(contextMenu.agentId)
              setContextMenu(null)
            }}
            className="w-full px-3 py-2 text-left text-sm text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] flex items-center gap-2"
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
              className="w-full px-3 py-2 text-left text-sm text-[var(--hg-destructive)] hover:bg-[var(--hg-surface-hover)] flex items-center gap-2"
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
