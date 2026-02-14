'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Pencil, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { useAgentStore } from '@/lib/agents/store'
import { AgentDefinition, AgentTier, TIER_INFO } from '@/lib/agents/types'
import { AgentCreatorModal } from './AgentCreatorModal'
import { HyggeButton } from '@/components/hygge/HyggeButton'

interface Props {
  projectId?: string
}

function AgentSummaryPanel({ agent, onClose }: { agent: AgentDefinition; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 bg-[var(--hg-bg)] flex flex-col overflow-hidden">
      <div className="p-4 border-b border-[var(--hg-border)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--hg-text-primary)]">{agent.name}</h3>
        <button
          onClick={onClose}
          className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Role</p>
          <p className="text-sm text-[var(--hg-text-secondary)]">{agent.role}</p>
        </div>

        <div>
          <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Persona</p>
          <p className="text-sm text-[var(--hg-text-secondary)]">{agent.persona.description}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Configuration</p>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">semantic focus</span>
            <span className="hg-fill" />
            <span className="hg-value">"{agent.memory.semanticFocus}"</span>
          </div>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">temperature</span>
            <span className="hg-fill" />
            <span className="hg-value">{agent.model.temperature.toFixed(2)}</span>
          </div>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">max tokens</span>
            <span className="hg-fill" />
            <span className="hg-value">{agent.model.maxTokens}</span>
          </div>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">reasoning</span>
            <span className="hg-fill" />
            <span className="hg-value">{agent.model.reasoningMode ? 'on' : 'off'}</span>
          </div>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">tools</span>
            <span className="hg-fill" />
            <span className="hg-value">{agent.capabilities.tools.length}</span>
          </div>
          <div className="hg-stat-line text-xs">
            <span className="hg-label">writes back</span>
            <span className="hg-fill" />
            <span className="hg-value">{agent.memory.writesBack?.join(', ') || 'none'}</span>
          </div>
        </div>

        {agent.persona.principles.length > 0 && (
          <div>
            <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Principles</p>
            <ul className="space-y-1">
              {agent.persona.principles.map((p, i) => (
                <li key={i} className="text-xs text-[var(--hg-text-secondary)]">— {p}</li>
              ))}
            </ul>
          </div>
        )}

        {agent.capabilities.actions.length > 0 && (
          <div>
            <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Actions</p>
            <p className="text-xs text-[var(--hg-text-secondary)]">{agent.capabilities.actions.join(' · ')}</p>
          </div>
        )}

        {agent.capabilities.boundaries.length > 0 && (
          <div>
            <p className="text-xs text-[var(--hg-text-tertiary)] uppercase tracking-wider mb-1">Boundaries</p>
            <ul className="space-y-1">
              {agent.capabilities.boundaries.map((b, i) => (
                <li key={i} className="text-xs text-[var(--hg-text-secondary)]">— {b}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function CompactAgentCard({
  agent,
  isActive,
  onSelect,
  onContextMenu,
  onShowSummary,
}: {
  agent: AgentDefinition
  isActive: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onShowSummary: () => void
}) {
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={clsx(
        'w-full flex items-center justify-between px-3 py-2 border-l-2 transition-colors text-left group',
        isActive
          ? 'border-l-[var(--hg-accent)] bg-[var(--hg-accent-muted)] text-[var(--hg-text-primary)]'
          : 'border-l-transparent text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)]'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{agent.name}</p>
        <p className="text-xs text-[var(--hg-text-tertiary)] truncate">{agent.role}</p>
      </div>
      <span
        onClick={(e) => {
          e.stopPropagation()
          onShowSummary()
        }}
        className="text-[10px] text-[var(--hg-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 hover:text-[var(--hg-accent)] cursor-pointer"
      >
        details
      </span>
    </button>
  )
}

function TierGroup({
  tier,
  agents,
  activeAgentId,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  onShowSummary,
}: {
  tier: AgentTier
  agents: AgentDefinition[]
  activeAgentId?: string
  expanded: boolean
  onToggle: () => void
  onSelect: (agent: AgentDefinition) => void
  onContextMenu: (e: React.MouseEvent, agentId: string) => void
  onShowSummary: (agent: AgentDefinition) => void
}) {
  if (agents.length === 0) return null

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-6 py-1.5 flex items-center gap-2 hover:bg-[var(--hg-surface-hover)] transition-colors"
        title={TIER_INFO[tier].description}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[var(--hg-text-tertiary)]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[var(--hg-text-tertiary)]" />
        )}
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--hg-text-tertiary)]">
          {TIER_INFO[tier].label}
        </span>
        <span className="text-[11px] text-[var(--hg-text-tertiary)] ml-auto">
          {agents.length}
        </span>
      </button>

      {expanded && (
        <div className="pb-1">
          {agents.map((agent) => (
            <CompactAgentCard
              key={agent.id}
              agent={agent}
              isActive={activeAgentId === agent.id}
              onSelect={() => onSelect(agent)}
              onContextMenu={(e) => onContextMenu(e, agent.id)}
              onShowSummary={() => onShowSummary(agent)}
            />
          ))}
        </div>
      )}
    </div>
  )
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

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    auto: true,
    myAgents: false,
    prebuilt: false,
  })

  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<{ agentId: string; x: number; y: number } | null>(null)
  const [summaryAgent, setSummaryAgent] = useState<AgentDefinition | null>(null)

  useEffect(() => {
    initializeAgents()
  }, [initializeAgents])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const toggleTier = (key: string) => {
    setExpandedTiers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleContextMenu = (e: React.MouseEvent, agentId: string) => {
    e.preventDefault()
    setContextMenu({ agentId, x: e.clientX, y: e.clientY })
  }

  const customAgents = useMemo(() => agents.filter(a => a.isCustom), [agents])
  const prebuiltAgents = useMemo(() => agents.filter(a => a.isBuiltIn), [agents])

  const groupByTier = (list: AgentDefinition[]) => ({
    reasoning: list.filter(a => a.tier === 'reasoning'),
    balanced: list.filter(a => a.tier === 'balanced'),
    fast: list.filter(a => a.tier === 'fast'),
  })

  const customByTier = useMemo(() => groupByTier(customAgents), [customAgents])
  const prebuiltByTier = useMemo(() => groupByTier(prebuiltAgents), [prebuiltAgents])

  const editingAgent = editingAgentId ? agents.find(a => a.id === editingAgentId) : null

  return (
    <>
      <div className="w-full bg-[var(--hg-bg)] border-l border-[var(--hg-border)] flex flex-col min-h-0 h-full overflow-hidden relative">
        {/* Summary Popout */}
        {summaryAgent && (
          <AgentSummaryPanel agent={summaryAgent} onClose={() => setSummaryAgent(null)} />
        )}

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

        {/* Active Agent Indicator */}
        {activeAgent && (
          <div className="px-4 py-2.5 border-b border-[var(--hg-border)] bg-[var(--hg-surface)]">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-[var(--hg-text-tertiary)]">Active</p>
                <p className="text-sm font-medium text-[var(--hg-text-primary)] truncate">{activeAgent.name}</p>
              </div>
              <button
                onClick={() => setActiveAgent(null)}
                className="text-[10px] text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)] transition-colors"
              >
                clear
              </button>
            </div>
          </div>
        )}

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Auto Section */}
          <div className="border-b border-[var(--hg-border)]">
            <button
              onClick={() => {
                setActiveAgent(null)
                toggleSection('auto')
              }}
              className={clsx(
                'w-full px-4 py-3 flex items-center gap-2 transition-colors text-left',
                !activeAgent
                  ? 'bg-[var(--hg-accent-muted)]'
                  : 'hover:bg-[var(--hg-surface-hover)]'
              )}
            >
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--hg-text-secondary)]">
                Auto
              </span>
              <span className="text-xs text-[var(--hg-text-tertiary)] ml-2">
                — let Chorum choose
              </span>
            </button>
          </div>

          {/* My Agents Section */}
          <div className="border-b border-[var(--hg-border)]">
            <button
              onClick={() => toggleSection('myAgents')}
              className="w-full px-4 py-3 flex items-center gap-2 hover:bg-[var(--hg-surface-hover)] transition-colors"
            >
              {expandedSections.myAgents ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
              )}
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--hg-text-secondary)]">
                My Agents
              </span>
              <span className="text-xs text-[var(--hg-text-tertiary)] ml-auto">
                {customAgents.length}
              </span>
            </button>

            {expandedSections.myAgents && (
              <div className="pb-1">
                {customAgents.length === 0 ? (
                  <p className="px-6 py-3 text-xs text-[var(--hg-text-tertiary)]">
                    No custom agents yet. Click "create" to build one.
                  </p>
                ) : (
                  (['reasoning', 'balanced', 'fast'] as AgentTier[]).map((tier) => (
                    <TierGroup
                      key={`custom-${tier}`}
                      tier={tier}
                      agents={customByTier[tier]}
                      activeAgentId={activeAgent?.id}
                      expanded={!!expandedTiers[`custom-${tier}`]}
                      onToggle={() => toggleTier(`custom-${tier}`)}
                      onSelect={setActiveAgent}
                      onContextMenu={handleContextMenu}
                      onShowSummary={setSummaryAgent}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Prebuilt Agents Section */}
          <div className="border-b border-[var(--hg-border)]">
            <button
              onClick={() => toggleSection('prebuilt')}
              className="w-full px-4 py-3 flex items-center gap-2 hover:bg-[var(--hg-surface-hover)] transition-colors"
            >
              {expandedSections.prebuilt ? (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--hg-text-tertiary)]" />
              )}
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--hg-text-secondary)]">
                Prebuilt Agents
              </span>
              <span className="text-xs text-[var(--hg-text-tertiary)] ml-auto">
                {prebuiltAgents.length}
              </span>
            </button>

            {expandedSections.prebuilt && (
              <div className="pb-1">
                {(['reasoning', 'balanced', 'fast'] as AgentTier[]).map((tier) => (
                  <TierGroup
                    key={`prebuilt-${tier}`}
                    tier={tier}
                    agents={prebuiltByTier[tier]}
                    activeAgentId={activeAgent?.id}
                    expanded={!!expandedTiers[`prebuilt-${tier}`]}
                    onToggle={() => toggleTier(`prebuilt-${tier}`)}
                    onSelect={setActiveAgent}
                    onContextMenu={handleContextMenu}
                    onShowSummary={setSummaryAgent}
                  />
                ))}
              </div>
            )}
          </div>
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
