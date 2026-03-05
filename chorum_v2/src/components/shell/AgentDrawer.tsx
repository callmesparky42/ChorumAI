'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { HyggeModal, HyggeInput, HyggeButton } from '@/components/hygge'

export type PersonaTier = 'thinking' | 'balanced' | 'fast'

export interface PersonaSummary {
    id: string
    name: string
    description: string
    isSystem: boolean
    temperature: number
    maxTokens: number
    tier: PersonaTier | null
}

export interface CreatePersonaInput {
    name: string
    description: string
    role: string                // "You are a..."
    corePrinciples: string[]    // bullet points
    actions: string[]           // "I will..."
    boundaries: string[]        // "I will not..."
    temperature: number
    maxTokens: number
}

export interface AgentDrawerProps {
    personas: PersonaSummary[]
    activePersonaId: string
    isOpen: boolean
    onSelectPersona: (id: string) => void
    onClearPersona: () => void
    onCreatePersona: (input: CreatePersonaInput) => Promise<void>
    onDeletePersona: (id: string) => Promise<void>
    onClose: () => void
}

// Assemble a structured system prompt from the structured fields
export function composeSystemPrompt(input: Omit<CreatePersonaInput, 'name' | 'description' | 'temperature' | 'maxTokens'>): string {
    const parts: string[] = []

    parts.push(input.role.trim())
    parts.push('\n{{context}}')

    const principles = input.corePrinciples.map(p => p.trim()).filter(Boolean)
    if (principles.length > 0) {
        parts.push('\nCore Principles:\n' + principles.map(p => `- ${p}`).join('\n'))
    }

    const actions = input.actions.map(a => a.trim()).filter(Boolean)
    if (actions.length > 0) {
        parts.push('\nI will:\n' + actions.map(a => `- ${a}`).join('\n'))
    }

    const bounds = input.boundaries.map(b => b.trim()).filter(Boolean)
    if (bounds.length > 0) {
        parts.push('\nI will not:\n' + bounds.map(b => `- ${b}`).join('\n'))
    }

    return parts.join('\n')
}

const TIER_LABELS: Record<PersonaTier, string> = {
    thinking: 'Thinking',
    balanced: 'Balanced',
    fast: 'Fast',
}

const TIER_ORDER: PersonaTier[] = ['thinking', 'balanced', 'fast']

function MultiLineInput({
    label,
    hint,
    value,
    onChange,
    placeholder,
    rows = 3,
}: {
    label: string
    hint: string
    value: string
    onChange: (v: string) => void
    placeholder: string
    rows?: number
}) {
    return (
        <div>
            <div className="flex items-baseline justify-between mb-1">
                <label className="text-xs text-[var(--hg-text-secondary)]">{label}</label>
                <span className="text-[10px] text-[var(--hg-text-tertiary)]">{hint}</span>
            </div>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-xs text-[var(--hg-text-primary)] outline-none focus:border-[var(--hg-accent)] resize-none placeholder:text-[var(--hg-text-tertiary)]"
            />
        </div>
    )
}

function CreatePersonaModal({
    onSubmit,
    onClose,
}: {
    onSubmit: (input: CreatePersonaInput) => Promise<void>
    onClose: () => void
}) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [role, setRole] = useState('')
    const [principlesRaw, setPrinciplesRaw] = useState('')
    const [actionsRaw, setActionsRaw] = useState('')
    const [boundariesRaw, setBoundariesRaw] = useState('')
    const [temperature, setTemperature] = useState(0.7)
    const [maxTokens, setMaxTokens] = useState(2048)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const splitLines = (raw: string) => raw.split('\n').map(l => l.trim()).filter(Boolean)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || !description.trim() || !role.trim()) return
        setSubmitting(true)
        setError(null)
        try {
            await onSubmit({
                name: name.trim(),
                description: description.trim(),
                role: role.trim(),
                corePrinciples: splitLines(principlesRaw),
                actions: splitLines(actionsRaw),
                boundaries: splitLines(boundariesRaw),
                temperature,
                maxTokens,
            })
            onClose()
        } catch (err) {
            setError(String(err))
        } finally {
            setSubmitting(false)
        }
    }

    const isValid = name.trim() && description.trim() && role.trim()

    return (
        <HyggeModal open={true} title="New Persona" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4 w-[480px] max-w-full">

                <div className="grid grid-cols-2 gap-3">
                    <HyggeInput
                        label="Name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g., My Analyst"
                        autoFocus
                    />
                    <HyggeInput
                        label="Short description"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Shown in the persona list"
                    />
                </div>

                <MultiLineInput
                    label="Role"
                    hint="Who is this persona?"
                    value={role}
                    onChange={setRole}
                    placeholder={"You are a methodical analyst who identifies patterns and draws evidence-based conclusions..."}
                    rows={2}
                />

                <MultiLineInput
                    label="Core Principles"
                    hint="One per line"
                    value={principlesRaw}
                    onChange={setPrinciplesRaw}
                    placeholder={"Show reasoning chain for every conclusion\nDistinguish correlation from causation\nConfidence levels are mandatory"}
                    rows={3}
                />

                <div className="grid grid-cols-2 gap-3">
                    <MultiLineInput
                        label="Actions"
                        hint="I will... (one per line)"
                        value={actionsRaw}
                        onChange={setActionsRaw}
                        placeholder={"Present competing hypotheses\nFlag uncertainty explicitly"}
                        rows={3}
                    />
                    <MultiLineInput
                        label="Boundaries"
                        hint="I will not... (one per line)"
                        value={boundariesRaw}
                        onChange={setBoundariesRaw}
                        placeholder={"Make final decisions\nState opinion as fact"}
                        rows={3}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1 border-t border-[var(--hg-border)]">
                    <div>
                        <label className="block text-xs text-[var(--hg-text-secondary)] mb-1.5">
                            Temperature <span className="text-[var(--hg-text-tertiary)]">({temperature.toFixed(1)})</span>
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--hg-text-tertiary)]">precise</span>
                            <input
                                type="range"
                                min={0}
                                max={1.5}
                                step={0.1}
                                value={temperature}
                                onChange={e => setTemperature(Number(e.target.value))}
                                className="flex-1 accent-[var(--hg-accent)]"
                            />
                            <span className="text-[10px] text-[var(--hg-text-tertiary)]">creative</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--hg-text-secondary)] mb-1.5">Max Tokens</label>
                        <input
                            type="number"
                            min={512}
                            max={8192}
                            value={maxTokens}
                            onChange={e => setMaxTokens(Number(e.target.value))}
                            className="w-full bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-xs text-[var(--hg-text-primary)] outline-none focus:border-[var(--hg-accent)]"
                        />
                    </div>
                </div>

                {error && <p className="text-xs text-[var(--hg-destructive)]">{error}</p>}

                <div className="flex justify-end gap-2 pt-1">
                    <HyggeButton type="button" onClick={onClose}>Cancel</HyggeButton>
                    <HyggeButton
                        type="submit"
                        variant="accent"
                        disabled={!isValid || submitting}
                    >
                        {submitting ? 'Creating...' : 'Create Persona'}
                    </HyggeButton>
                </div>
            </form>
        </HyggeModal>
    )
}

function PersonaRow({
    persona,
    isActive,
    onSelect,
    onDelete,
}: {
    persona: PersonaSummary
    isActive: boolean
    onSelect: () => void
    onDelete?: () => void
}) {
    const [hovered, setHovered] = useState(false)
    const [showDetail, setShowDetail] = useState(false)

    return (
        <div
            className={clsx(
                'relative border-l-2 transition-colors',
                isActive
                    ? 'border-[var(--hg-accent)] bg-[var(--hg-surface)]'
                    : 'border-transparent hover:bg-[var(--hg-surface-hover)]'
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="flex items-center">
                <button
                    onClick={onSelect}
                    className={clsx('flex-1 text-left px-3 py-2.5', (onDelete || true) ? 'pr-14' : '')}
                >
                    <div className={clsx(
                        'text-xs font-medium',
                        isActive ? 'text-[var(--hg-text-primary)]' : 'text-[var(--hg-text-secondary)]'
                    )}>
                        {persona.name}
                    </div>
                    <div className="text-[10px] text-[var(--hg-text-tertiary)] truncate leading-snug mt-0.5">
                        {persona.description}
                    </div>
                </button>

                {/* Action icons */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {(hovered || showDetail) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail) }}
                            className={clsx(
                                'text-sm w-5 h-5 flex items-center justify-center transition-colors',
                                showDetail
                                    ? 'text-[var(--hg-accent)]'
                                    : 'text-[var(--hg-text-tertiary)] hover:text-[var(--hg-accent)]'
                            )}
                            title="Show details"
                        >
                            ℹ
                        </button>
                    )}
                    {onDelete && hovered && (
                        <button
                            onClick={onDelete}
                            className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-destructive)] text-sm w-5 h-5 flex items-center justify-center transition-colors"
                            title="Delete persona"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Expandable detail panel */}
            {showDetail && (
                <div className="px-3 pb-2.5 pt-0.5 space-y-1 border-t border-[var(--hg-border-subtle)] mx-2">
                    {persona.tier && (
                        <div className="flex justify-between text-[10px]">
                            <span className="text-[var(--hg-text-tertiary)]">tier</span>
                            <span className="text-[var(--hg-text-secondary)]">{persona.tier}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--hg-text-tertiary)]">temp</span>
                        <span className="text-[var(--hg-text-secondary)]">{persona.temperature.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                        <span className="text-[var(--hg-text-tertiary)]">max tokens</span>
                        <span className="text-[var(--hg-text-secondary)]">{persona.maxTokens.toLocaleString()}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

export function AgentDrawer({
    personas,
    activePersonaId,
    isOpen,
    onSelectPersona,
    onClearPersona,
    onCreatePersona,
    onDeletePersona,
    onClose,
}: AgentDrawerProps) {
    const [showCreate, setShowCreate] = useState(false)

    if (!isOpen) return null

    // Group personas by tier
    const grouped: Record<PersonaTier, PersonaSummary[]> = {
        thinking: [],
        balanced: [],
        fast: [],
    }
    const userPersonas: PersonaSummary[] = []

    for (const p of personas) {
        if (p.isSystem) {
            const tier = p.tier ?? 'balanced'
            grouped[tier].push(p)
        } else {
            userPersonas.push(p)
        }
    }

    return (
        <div className="h-full flex flex-col bg-[var(--hg-surface)] overflow-hidden w-56">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--hg-border)] shrink-0">
                <span className="text-xs font-medium text-[var(--hg-text-secondary)] uppercase tracking-wider">Persona</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowCreate(true)}
                        className="w-6 h-6 flex items-center justify-center text-[var(--hg-text-tertiary)] hover:text-[var(--hg-accent)] hover:bg-[var(--hg-surface-hover)] transition-colors"
                        title="New persona"
                    >
                        +
                    </button>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)] transition-colors text-sm"
                        title="Close"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Persona list */}
            <div className="flex-1 overflow-y-auto py-1">
                {/* Default */}
                <div className={clsx(
                    'border-l-2 transition-colors',
                    activePersonaId === ''
                        ? 'border-[var(--hg-accent)] bg-[var(--hg-surface)]'
                        : 'border-transparent hover:bg-[var(--hg-surface-hover)]'
                )}>
                    <button
                        onClick={onClearPersona}
                        className="w-full text-left px-3 py-2.5"
                    >
                        <div className={clsx(
                            'text-xs font-medium',
                            activePersonaId === '' ? 'text-[var(--hg-text-primary)]' : 'text-[var(--hg-text-secondary)]'
                        )}>
                            Default
                        </div>
                        <div className="text-[10px] text-[var(--hg-text-tertiary)] leading-snug mt-0.5">General assistant</div>
                    </button>
                </div>

                {/* System personas grouped by tier */}
                {TIER_ORDER.map(tier => {
                    const group = grouped[tier]
                    if (group.length === 0) return null
                    return (
                        <div key={tier} className="mt-2">
                            <div className="px-3 py-1">
                                <span className="text-[9px] uppercase tracking-widest text-[var(--hg-text-tertiary)]">
                                    {TIER_LABELS[tier]}
                                </span>
                            </div>
                            {group.map(p => (
                                <PersonaRow
                                    key={p.id}
                                    persona={p}
                                    isActive={activePersonaId === p.id}
                                    onSelect={() => onSelectPersona(p.id)}
                                />
                            ))}
                        </div>
                    )
                })}

                {/* User-created personas */}
                {userPersonas.length > 0 && (
                    <div className="mt-2 border-t border-[var(--hg-border-subtle)] pt-2">
                        <div className="px-3 py-1">
                            <span className="text-[9px] uppercase tracking-widest text-[var(--hg-text-tertiary)]">Custom</span>
                        </div>
                        {userPersonas.map(p => (
                            <PersonaRow
                                key={p.id}
                                persona={p}
                                isActive={activePersonaId === p.id}
                                onSelect={() => onSelectPersona(p.id)}
                                onDelete={() => onDeletePersona(p.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {showCreate && (
                <CreatePersonaModal
                    onSubmit={async (input) => {
                        await onCreatePersona(input)
                        setShowCreate(false)
                    }}
                    onClose={() => setShowCreate(false)}
                />
            )}
        </div>
    )
}
