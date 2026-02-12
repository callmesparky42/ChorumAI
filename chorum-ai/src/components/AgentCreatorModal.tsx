'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, AlertTriangle, Brain, Gauge, Zap, Shield, Lightbulb } from 'lucide-react'
import clsx from 'clsx'
import { useAgentStore, AGENT_TEMPLATE } from '@/lib/agents/store'
import { HyggeButton } from './hygge/HyggeButton'
import { AgentDefinition, AgentTier, TIER_INFO } from '@/lib/agents/types'

// Common emoji options for agents


// Enforced guardrails that all custom agents must have
const ENFORCED_GUARDRAILS = [
  'Show reasoning for decisions',
  'Flag uncertainty explicitly',
  'Never fabricate information',
  'Respect human checkpoints',
  'Log all significant actions'
]

interface Props {
  agent?: AgentDefinition
  onClose: () => void
}

export function AgentCreatorModal({ agent, onClose }: Props) {
  const { createAgent, updateAgent } = useAgentStore()
  const isEditing = !!agent

  // Form state
  const [name, setName] = useState(agent?.name || '')
  const [role, setRole] = useState(agent?.role || '')
  const [icon, setIcon] = useState(agent?.icon || '🤖')
  const [tier, setTier] = useState<AgentTier>(agent?.tier || 'balanced')

  // Persona
  const [personaDescription, setPersonaDescription] = useState(agent?.persona.description || '')
  const [personaTone, setPersonaTone] = useState(agent?.persona.tone || '')
  const [principles, setPrinciples] = useState<string[]>(agent?.persona.principles || [''])

  // Model
  const [temperature, setTemperature] = useState(agent?.model.temperature || 0.5)
  const [maxTokens, setMaxTokens] = useState(agent?.model.maxTokens || 3000)
  const [reasoningMode, setReasoningMode] = useState(agent?.model.reasoningMode || false)

  // Memory - THE KEY SECTION
  const [semanticFocus, setSemanticFocus] = useState(agent?.memory.semanticFocus || '')
  const [requiredContext, setRequiredContext] = useState<string[]>(agent?.memory.requiredContext || ['project.md'])
  const [optionalContext, setOptionalContext] = useState<string[]>(agent?.memory.optionalContext || [])
  const [writesBack, setWritesBack] = useState<string[]>(agent?.memory.writesBack || ['patterns'])

  // Capabilities
  const [actions, setActions] = useState<string[]>(agent?.capabilities.actions || [''])
  const [boundaries, setBoundaries] = useState<string[]>(agent?.capabilities.boundaries || [''])

  // Custom guardrails (in addition to enforced ones)
  const [customGuardrails, setCustomGuardrails] = useState<string[]>(
    agent?.guardrails.hardLimits.filter(g => !ENFORCED_GUARDRAILS.includes(g)) || []
  )
  const [escalateTo, setEscalateTo] = useState(agent?.guardrails.escalateTo || '')
  const [humanCheckpoint, setHumanCheckpoint] = useState(agent?.guardrails.humanCheckpoint || '')

  // UI state
  const [activeTab, setActiveTab] = useState<'identity' | 'memory' | 'capabilities' | 'guardrails'>('identity')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Update reasoning mode when tier changes
  useEffect(() => {
    if (tier === 'reasoning') {
      setReasoningMode(true)
      setTemperature(prev => Math.min(prev, 0.4))
    } else {
      setReasoningMode(false)
    }
  }, [tier])

  const handleSubmit = () => {
    if (!name.trim() || !role.trim() || !semanticFocus.trim()) {
      alert('Name, role, and semantic focus are required')
      return
    }

    const agentData: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'> = {
      name: name.trim(),
      role: role.trim(),
      icon,
      tier,
      persona: {
        description: personaDescription.trim(),
        tone: personaTone.trim(),
        principles: principles.filter(p => p.trim())
      },
      model: {
        temperature,
        maxTokens,
        reasoningMode
      },
      memory: {
        semanticFocus: semanticFocus.trim(),
        requiredContext: requiredContext.filter(c => c.trim()),
        optionalContext: optionalContext.filter(c => c.trim()),
        writesBack: writesBack.filter(w => w.trim())
      },
      capabilities: {
        tools: ['file_read'], // Default tools
        actions: actions.filter(a => a.trim()),
        boundaries: boundaries.filter(b => b.trim())
      },
      guardrails: {
        hardLimits: [...ENFORCED_GUARDRAILS, ...customGuardrails.filter(g => g.trim())],
        escalateTo: escalateTo.trim() || undefined,
        humanCheckpoint: humanCheckpoint.trim() || undefined
      },
      isCustom: true
    }

    if (isEditing && agent) {
      updateAgent(agent.id, agentData)
    } else {
      createAgent(agentData)
    }

    onClose()
  }

  // Helper to add/remove items from arrays
  const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => [...prev, ''])
  }

  const updateItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string) => {
    setter(prev => prev.map((item, i) => i === index ? value : item))
  }

  const removeItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number) => {
    setter(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--hg-border)] flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--hg-text-primary)]">
            {isEditing ? 'Edit Agent' : 'Create Custom Agent'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--hg-surface-hover)] rounded-lg text-[var(--hg-text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-[var(--hg-border)]">
          <div className="flex gap-1">
            {[
              { id: 'identity', label: 'Identity' },
              { id: 'memory', label: 'Memory' },
              { id: 'capabilities', label: 'Capabilities' },
              { id: 'guardrails', label: 'Guardrails' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                  'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'text-[var(--hg-accent)] border-[var(--hg-accent)]'
                    : 'text-[var(--hg-text-secondary)] border-transparent hover:text-[var(--hg-text-primary)]'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div className="space-y-6">
              {/* Name (Icon removed) */}
              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1.5">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2.5 text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)]"
                  placeholder="e.g., Security Analyst"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1.5">Role *</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2.5 text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)]"
                  placeholder="e.g., Analyzes code for security vulnerabilities"
                />
              </div>

              {/* Tier Selection */}
              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-2">Tier *</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['reasoning', 'balanced', 'fast'] as AgentTier[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={clsx(
                        'p-3 rounded-lg border text-left transition-all',
                        tier === t
                          ? `bg-[var(--hg-surface-hover)] border-[var(--hg-accent)] text-[var(--hg-text-primary)]`
                          : 'border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:border-[var(--hg-border-subtle)] bg-[var(--hg-bg)]'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {t === 'reasoning' && <Brain className="w-4 h-4" />}
                        {t === 'balanced' && <Gauge className="w-4 h-4" />}
                        {t === 'fast' && <Zap className="w-4 h-4" />}
                        <span className="font-medium text-sm">{TIER_INFO[t].label}</span>
                      </div>
                      <p className="text-xs opacity-70">{TIER_INFO[t].description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Persona */}
              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1.5">Persona Description</label>
                <textarea
                  value={personaDescription}
                  onChange={(e) => setPersonaDescription(e.target.value)}
                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2.5 text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)] min-h-[80px]"
                  placeholder="e.g., Methodical, security-focused. Questions everything..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1.5">Tone</label>
                <input
                  type="text"
                  value={personaTone}
                  onChange={(e) => setPersonaTone(e.target.value)}
                  className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2.5 text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)]"
                  placeholder="e.g., Direct, technical, cautious"
                />
              </div>

              {/* Principles */}
              <div>
                <label className="block text-xs font-medium text-[var(--hg-text-secondary)] mb-1.5">Core Principles</label>
                {principles.map((principle, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={principle}
                      onChange={(e) => updateItem(setPrinciples, index, e.target.value)}
                      className="flex-1 bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2 text-[var(--hg-text-primary)] text-sm focus:outline-none focus:border-[var(--hg-accent)]"
                      placeholder="e.g., Always verify before trusting"
                    />
                    <button
                      onClick={() => removeItem(setPrinciples, index)}
                      className="p-2 text-[var(--hg-text-tertiary)] hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setPrinciples)}
                  className="text-sm text-[var(--hg-accent)] hover:text-[var(--hg-accent-hover)] flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add principle
                </button>
              </div>
            </div>
          )}

          {/* Memory Tab - THE KEY TAB */}
          {activeTab === 'memory' && (
            <div className="space-y-6">
              {/* Semantic Focus - Most Important */}
              <div className="p-4 bg-[var(--hg-surface-hover)] border border-[var(--hg-border-subtle)] rounded-lg">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-[var(--hg-accent)] mt-0.5" />
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-[var(--hg-accent)] mb-1">
                      Semantic Focus *
                    </label>
                    <p className="text-xs text-[var(--hg-text-secondary)] mb-3 opacity-80">
                      This is the question your agent asks of project memory. It determines what meaning gets extracted, not just what text is included.
                    </p>
                    <textarea
                      value={semanticFocus}
                      onChange={(e) => setSemanticFocus(e.target.value)}
                      className="w-full bg-[var(--hg-bg)] border border-[var(--hg-border)] rounded-lg px-3 py-2.5 text-[var(--hg-text-primary)] focus:outline-none focus:border-[var(--hg-accent)] min-h-[60px]"
                      placeholder='e.g., "What security patterns exist? What vulnerabilities have been found before?"'
                    />
                  </div>
                </div>
              </div>

              {/* Required Context */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Required Context Files</label>
                <p className="text-xs text-gray-500 mb-2">Memory files always included for this agent</p>
                {requiredContext.map((ctx, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={ctx}
                      onChange={(e) => updateItem(setRequiredContext, index, e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g., project.md"
                    />
                    <button
                      onClick={() => removeItem(setRequiredContext, index)}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setRequiredContext)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add context file
                </button>
              </div>

              {/* Optional Context */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Optional Context Files</label>
                <p className="text-xs text-gray-500 mb-2">Included if relevant to the task</p>
                {optionalContext.map((ctx, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={ctx}
                      onChange={(e) => updateItem(setOptionalContext, index, e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g., security-guidelines.md"
                    />
                    <button
                      onClick={() => removeItem(setOptionalContext, index)}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setOptionalContext)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add optional context
                </button>
              </div>

              {/* Writes Back - Bidirectional */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Writes Back To Memory</label>
                <p className="text-xs text-gray-500 mb-2">What this agent contributes to project memory</p>
                <div className="flex flex-wrap gap-2">
                  {['patterns', 'decisions', 'learnings'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        if (writesBack.includes(option)) {
                          setWritesBack(writesBack.filter(w => w !== option))
                        } else {
                          setWritesBack([...writesBack, option])
                        }
                      }}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                        writesBack.includes(option)
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Settings */}
              <div className="pt-4 border-t border-[var(--hg-border)]">
                <h3 className="text-sm font-medium text-[var(--hg-text-primary)] mb-4">Model Settings</h3>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400">Temperature</label>
                      <span className="text-xs text-gray-500">{temperature}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full accent-[var(--hg-accent)]"
                    />
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Precise</span>
                      <span>Creative</span>
                    </div>
                  </div>

                  {tier === 'reasoning' && (
                    <div className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <div>
                        <p className="text-sm text-purple-400 font-medium">Reasoning Mode</p>
                        <p className="text-xs text-purple-300/70">Extended thinking for complex analysis</p>
                      </div>
                      <div className="text-purple-400">
                        <Brain className="w-5 h-5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Capabilities Tab */}
          {activeTab === 'capabilities' && (
            <div className="space-y-6">
              {/* Actions */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Actions</label>
                <p className="text-xs text-gray-500 mb-2">What this agent can do</p>
                {actions.map((action, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={action}
                      onChange={(e) => updateItem(setActions, index, e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g., Scan code for vulnerabilities"
                    />
                    <button
                      onClick={() => removeItem(setActions, index)}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setActions)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add action
                </button>
              </div>

              {/* Boundaries */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Boundaries</label>
                <p className="text-xs text-gray-500 mb-2">What this agent should NOT do</p>
                {boundaries.map((boundary, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={boundary}
                      onChange={(e) => updateItem(setBoundaries, index, e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g., Does NOT auto-fix code"
                    />
                    <button
                      onClick={() => removeItem(setBoundaries, index)}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setBoundaries)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add boundary
                </button>
              </div>
            </div>
          )}

          {/* Guardrails Tab */}
          {activeTab === 'guardrails' && (
            <div className="space-y-6">
              {/* Enforced Guardrails - Cannot be removed */}
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400 mb-2">Enforced Guardrails</p>
                    <p className="text-xs text-amber-300/70 mb-3">
                      These guardrails are automatically applied to all custom agents and cannot be removed.
                    </p>
                    <ul className="space-y-1.5">
                      {ENFORCED_GUARDRAILS.map((guardrail, index) => (
                        <li key={index} className="text-xs text-amber-200/80 flex items-center gap-2">
                          <span className="w-1 h-1 bg-amber-400 rounded-full"></span>
                          {guardrail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Custom Guardrails */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Additional Guardrails</label>
                <p className="text-xs text-gray-500 mb-2">Custom hard limits for this agent</p>
                {customGuardrails.map((guardrail, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={guardrail}
                      onChange={(e) => updateItem(setCustomGuardrails, index, e.target.value)}
                      className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                      placeholder="e.g., Never execute code without review"
                    />
                    <button
                      onClick={() => removeItem(setCustomGuardrails, index)}
                      className="p-2 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addItem(setCustomGuardrails)}
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add guardrail
                </button>
              </div>

              {/* Escalation */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Escalate To (Agent)</label>
                <input
                  type="text"
                  value={escalateTo}
                  onChange={(e) => setEscalateTo(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g., architect"
                />
              </div>

              {/* Human Checkpoint */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Human Checkpoint</label>
                <p className="text-xs text-gray-500 mb-2">When to require human approval</p>
                <input
                  type="text"
                  value={humanCheckpoint}
                  onChange={(e) => setHumanCheckpoint(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Before making any security-critical changes"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--hg-border)] flex justify-between items-center">
          <p className="text-xs text-[var(--hg-text-tertiary)]">
            {isEditing ? 'Changes auto-save to .chorum/agents/' : 'Will be saved to .chorum/agents/'}
          </p>
          <div className="flex gap-3">
            <HyggeButton
              variant="ghost"
              onClick={onClose}
              className="px-4"
            >
              Cancel
            </HyggeButton>
            <HyggeButton
              variant="accent"
              onClick={handleSubmit}
              className="px-4"
            >
              {isEditing ? 'Save Changes' : 'Create Agent'}
            </HyggeButton>
          </div>
        </div>
      </div>
    </div>
  )
}
