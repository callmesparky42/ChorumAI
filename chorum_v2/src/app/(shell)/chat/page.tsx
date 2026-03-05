'use client'

import { useEffect, useState, useRef, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChat } from '@/lib/shell/hooks'
import { HyggeToast, HyggeModal, HyggeInput, HyggeButton, HyggeToggle } from '@/components/hygge'
import { ProjectsDrawer } from '@/components/shell/ProjectsDrawer'
import { AgentDrawer } from '@/components/shell/AgentDrawer'
import { Omnibar } from '@/components/shell/Omnibar'
import { MessageContent } from '@/components/shell/MessageContent'
import {
    getProjects,
    createProject,
    deleteProject,
    getConversationsForProject,
    getUnassignedConversations,
    assignConversationToProject,
    getPersonas,
    getUserProviders,
    createPersona,
    deletePersona,
    deleteConversation,
} from '@/lib/shell/actions'
import type { Project, CreateProjectInput } from '@/lib/shell/actions'
import type { ConversationSummary } from '@/components/shell/ProjectsDrawer'
import type { PersonaSummary, CreatePersonaInput } from '@/components/shell/AgentDrawer'
import { composeSystemPrompt } from '@/components/shell/AgentDrawer'
import type { OmnibarAttachment } from '@/components/shell/Omnibar'
import type { InjectedItem } from '@/lib/shell/hooks'
import clsx from 'clsx'

const HUMAN_TYPE_MAP: Record<string, string> = {
    invariant: 'Rule',
    pattern: 'Pattern',
    antipattern: 'Thing to avoid',
    decision: 'Decision',
    golden_path: 'How-to',
    anchor: 'Anchor',
    character: 'Character',
    setting: 'Setting',
    plot_thread: 'Plot thread',
    voice: 'Voice',
    world_rule: 'World rule',
}

function InjectedContextPanel({
    items,
    onFeedback,
    ratedItems,
}: {
    items: InjectedItem[]
    onFeedback: (item: InjectedItem, idx: number, signal: 'positive' | 'negative') => void
    ratedItems: Record<number, 'positive' | 'negative'>
}) {
    const [expanded, setExpanded] = useState(false)
    if (items.length === 0) return null

    return (
        <div className="ml-4 mt-2 border border-[var(--hg-border)] bg-[var(--hg-bg)] max-w-xl">
            <button
                className="w-full flex justify-between items-center p-2 text-xs text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface)] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <span>┌─ context injected ({items.length} items) ─┐</span>
                <span>{expanded ? '▼' : '▲'}</span>
            </button>
            {expanded && (
                <div className="max-h-48 overflow-y-auto border-t border-[var(--hg-border)] bg-[var(--hg-surface)]">
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className="flex justify-between items-start py-1.5 px-3 text-xs border-b border-[var(--hg-border-subtle)] last:border-0 group"
                        >
                            <div className="flex-1 pr-4">
                                <span className="text-[var(--hg-text-tertiary)] mr-2">
                                    {HUMAN_TYPE_MAP[item.type] || item.type}:
                                </span>
                                <span className="text-[var(--hg-text-primary)]">{item.content}</span>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                    className={ratedItems[i] === 'positive' ? 'text-[var(--hg-accent)]' : 'hover:text-[var(--hg-accent)] text-[var(--hg-text-tertiary)]'}
                                    onClick={() => onFeedback(item, i, 'positive')}
                                >👍</button>
                                <button
                                    className={ratedItems[i] === 'negative' ? 'text-[var(--hg-destructive)]' : 'hover:text-[var(--hg-destructive)] text-[var(--hg-text-tertiary)]'}
                                    onClick={() => onFeedback(item, i, 'negative')}
                                >👎</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function NewProjectModal({
    onSubmit,
    onClose,
}: {
    onSubmit: (input: CreateProjectInput) => Promise<void>
    onClose: () => void
}) {
    const [name, setName] = useState('')
    const [scopesRaw, setScopesRaw] = useState('')
    const [crossLens, setCrossLens] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        const include = scopesRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => (s.startsWith('#') ? s : `#${s}`))
        setSubmitting(true)
        try {
            await onSubmit({
                name: name.trim(),
                scopeFilter: { include, exclude: [] },
                crossLensAccess: crossLens,
            })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <HyggeModal open={true} title="New Project" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4 min-w-[340px]">
                <HyggeInput
                    label="Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g., Options Trading"
                    autoFocus
                />
                <HyggeInput
                    label="Scope tags (comma separated)"
                    value={scopesRaw}
                    onChange={e => setScopesRaw(e.target.value)}
                    placeholder="python, trading"
                />
                <div className="flex items-start gap-3">
                    <HyggeToggle
                        checked={crossLens}
                        onChange={setCrossLens}
                        label="Cross-lens access"
                        description="Surface learnings from all scopes, not just this project's tags."
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <HyggeButton type="button" onClick={onClose}>Cancel</HyggeButton>
                    <HyggeButton type="submit" variant="accent" disabled={!name.trim() || submitting}>
                        {submitting ? 'Creating...' : 'Create Project'}
                    </HyggeButton>
                </div>
            </form>
        </HyggeModal>
    )
}

function ChatPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const {
        messages,
        isStreaming,
        isLoadingConversation,
        conversationId,
        activePersona,
        setActivePersona,
        sendMessage,
        submitFeedback,
        loadConversations,
        loadConversation,
        newConversation,
        injectedContext,
        resultMeta,
        streamError,
        selectedProvider,
        setSelectedProvider,
    } = useChat()

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const isInitialScrollRef = useRef(false)
    const [isScrolledUp, setIsScrolledUp] = useState(false)
    const [ratedItems, setRatedItems] = useState<Record<number, 'positive' | 'negative'>>({})
    const [toast, setToast] = useState<string | null>(null)

    // Drawer state (persists to localStorage after mount)
    const [leftOpen, setLeftOpen] = useState<boolean>(true) // SSR default
    const [rightOpen, setRightOpen] = useState<boolean>(false) // SSR default

    // Hydrate drawer state
    useEffect(() => {
        const left = localStorage.getItem('chorum_projects_drawer_open')
        const right = localStorage.getItem('chorum_agent_drawer_open')
        if (left !== null) setLeftOpen(left !== 'false')
        if (right !== null) setRightOpen(right === 'true')
    }, [])

    // Projects state
    const [projects, setProjects] = useState<Project[]>([])
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
    const [conversationsByProject, setConversationsByProject] = useState<Record<string, ConversationSummary[]>>({})
    const [unassignedConversations, setUnassignedConversations] = useState<ConversationSummary[]>([])
    const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)
    const [showNewProjectModal, setShowNewProjectModal] = useState(false)

    // Personas state
    const [personas, setPersonas] = useState<PersonaSummary[]>([])
    const [showNewPersonaModal, setShowNewPersonaModal] = useState(false)

    // Providers state (for Omnibar selector)
    const [providers, setProviders] = useState<string[]>([])

    // Persist drawer state
    useEffect(() => {
        localStorage.setItem('chorum_projects_drawer_open', String(leftOpen))
    }, [leftOpen])

    useEffect(() => {
        localStorage.setItem('chorum_agent_drawer_open', String(rightOpen))
    }, [rightOpen])

    // On mount: load data
    useEffect(() => {
        Promise.all([
            getProjects().then(setProjects),
            getUnassignedConversations().then(setUnassignedConversations),
            getPersonas('').then(ps => setPersonas(ps.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                isSystem: p.isSystem,
                temperature: p.temperature,
                maxTokens: p.maxTokens,
                tier: p.tier ?? null,
            })))),
            getUserProviders('').then(ps => setProviders(ps.map(p => p.provider))),
        ])
        loadConversations()
    }, [loadConversations])

    // Handle URL search params
    useEffect(() => {
        if (searchParams.get('new')) {
            newConversation()
            router.replace('/chat')
        } else if (searchParams.get('id')) {
            isInitialScrollRef.current = true
            loadConversation(searchParams.get('id') as string)
            router.replace('/chat')
        }
    }, [searchParams, newConversation, loadConversation, router])

    // Auto-scroll: instant on conversation load, smooth for new messages
    useEffect(() => {
        if (messages.length === 0) return
        const behavior = isInitialScrollRef.current ? 'instant' : 'smooth'
        isInitialScrollRef.current = false
        messagesEndRef.current?.scrollIntoView({ behavior })
    }, [messages])

    // Hide FAB when streaming starts (implies we're at bottom following tokens)
    useEffect(() => {
        if (isStreaming) setIsScrolledUp(false)
    }, [isStreaming])

    const handleScroll = useCallback(() => {
        const el = scrollContainerRef.current
        if (!el) return
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        setIsScrolledUp(distFromBottom > 150)
    }, [])

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    const handleSelectProject = useCallback(async (projectId: string | null) => {
        setActiveProjectId(projectId)
        await newConversation(undefined, projectId ?? undefined)
        if (projectId && !conversationsByProject[projectId]) {
            setLoadingProjectId(projectId)
            getConversationsForProject(projectId)
                .then(convos => setConversationsByProject(prev => ({ ...prev, [projectId]: convos })))
                .finally(() => setLoadingProjectId(null))
        }
    }, [newConversation, conversationsByProject])

    const handleExpandProject = useCallback(async (projectId: string) => {
        if (conversationsByProject[projectId]) return
        setLoadingProjectId(projectId)
        try {
            const convos = await getConversationsForProject(projectId)
            setConversationsByProject(prev => ({ ...prev, [projectId]: convos }))
        } finally {
            setLoadingProjectId(null)
        }
    }, [conversationsByProject])

    const handleCreateProject = async (input: CreateProjectInput) => {
        setShowNewProjectModal(false)
        try {
            const project = await createProject(input)
            // Optimistically add before full refetch to avoid timing race
            setProjects(prev => [...prev, project])
            setConversationsByProject(prev => ({ ...prev, [project.id]: [] }))
            setActiveProjectId(project.id)
            setToast(`Project "${project.name}" created`)
            // Fire-and-forget: refetch full list in background
            getProjects().then(setProjects)
            await newConversation(undefined, project.id)
        } catch (err) {
            console.error('Create project error:', err)
            setToast(`Failed to create project: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
    }

    const handleDeleteProject = async (id: string) => {
        const name = projects.find(p => p.id === id)?.name
        if (!window.confirm(`Delete "${name}"? Conversations will remain.`)) return
        try {
            await deleteProject(id)
            setProjects(prev => prev.filter(p => p.id !== id))
            if (activeProjectId === id) setActiveProjectId(null)
        } catch {
            setToast('Failed to delete project')
        }
    }

    const handleDeleteConversation = async (id: string, projectId: string | null) => {
        if (!window.confirm('Delete this conversation? This cannot be undone.')) return
        try {
            await deleteConversation(id)
            if (projectId) {
                setConversationsByProject(prev => ({
                    ...prev,
                    [projectId]: (prev[projectId] || []).filter(c => c.id !== id)
                }))
            } else {
                setUnassignedConversations(prev => prev.filter(c => c.id !== id))
            }
            if (conversationId === id) {
                newConversation(undefined, projectId || undefined)
            }
            setToast('Conversation deleted')
        } catch (err) {
            console.error('Delete conversation error:', err)
            setToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
    }

    const handleAssignToProject = async (conversationId: string, projectId: string) => {
        try {
            await assignConversationToProject(conversationId, projectId)
            // Move from unassigned to project bucket locally
            setUnassignedConversations(prev => prev.filter(c => c.id !== conversationId))
            const conv = unassignedConversations.find(c => c.id === conversationId)
            if (conv) {
                setConversationsByProject(prev => ({
                    ...prev,
                    [projectId]: [...(prev[projectId] || []), conv]
                }))
            }
            setToast('Conversation moved to project')
        } catch {
            setToast('Failed to move conversation')
        }
    }

    const handleFeedback = async (item: InjectedItem, index: number, signal: 'positive' | 'negative') => {
        setRatedItems(prev => ({ ...prev, [index]: signal }))
        try {
            if (item.id) await submitFeedback(item.id, signal)
        } catch (e) {
            console.error('Feedback error:', e)
        }
        setToast(`Feedback recorded — this learning will be ${signal === 'positive' ? 'prioritized' : 'reviewed'}`)
    }

    const handleCreatePersona = async (input: CreatePersonaInput) => {
        const systemPrompt = composeSystemPrompt({
            role: input.role,
            corePrinciples: input.corePrinciples,
            actions: input.actions,
            boundaries: input.boundaries,
        })
        await createPersona({
            name: input.name,
            description: input.description,
            systemPrompt,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
        }, '')
        const updated = await getPersonas('')
        setPersonas(updated.map(p => ({
            id: p.id, name: p.name, description: p.description,
            isSystem: p.isSystem, temperature: p.temperature, maxTokens: p.maxTokens,
            tier: p.tier ?? null,
        })))
    }

    const handleDeletePersona = async (id: string) => {
        await deletePersona(id, '')
        setPersonas(prev => prev.filter(p => p.id !== id))
        if (activePersona === id) setActivePersona('')
    }

    const emptyState = (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-xl font-medium text-[var(--hg-text-primary)] mb-2">What would you like to work on?</h2>
            <p className="text-sm text-[var(--hg-text-secondary)] max-w-md">
                {activeProjectId
                    ? `Working in ${projects.find(p => p.id === activeProjectId)?.name ?? 'project'}. Start typing to begin.`
                    : 'Start chatting to build your knowledge graph, or select a project to focus.'}
            </p>
        </div>
    )

    return (
        <div className="flex h-full w-full overflow-hidden">
            {toast && <HyggeToast message={toast} />}

            {/* Left drawer */}
            <div className={clsx(
                'flex-shrink-0 transition-all duration-200',
                leftOpen ? 'w-60' : 'w-0 overflow-hidden'
            )}>
                <ProjectsDrawer
                    projects={projects}
                    unassignedConversations={unassignedConversations}
                    conversationsByProject={conversationsByProject}
                    activeProjectId={activeProjectId}
                    activeConversationId={conversationId}
                    isOpen={leftOpen}
                    loadingProjectId={loadingProjectId}
                    onSelectProject={handleSelectProject}
                    onSelectConversation={(id, pid) => {
                        isInitialScrollRef.current = true
                        loadConversation(id)
                        setActiveProjectId(pid)
                    }}
                    onNewConversation={pid => newConversation(undefined, pid ?? undefined)}
                    onNewProject={() => setShowNewProjectModal(true)}
                    onDeleteProject={handleDeleteProject}
                    onExpandProject={handleExpandProject}
                    onAssignToProject={handleAssignToProject}
                    onDeleteConversation={handleDeleteConversation}
                    onClose={() => setLeftOpen(false)}
                />
            </div>

            {/* Center: chat */}
            <div className="flex-1 flex flex-col min-w-0 bg-[var(--hg-bg)] relative">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--hg-border)] shrink-0">
                    <div className="flex items-center gap-2">
                        <HyggeButton
                            variant="icon"
                            onClick={() => setLeftOpen(!leftOpen)}
                            title="Toggle projects"
                        >
                            ☰
                        </HyggeButton>
                        {activeProjectId && (
                            <span className="text-xs text-[var(--hg-text-tertiary)]">
                                {projects.find(p => p.id === activeProjectId)?.name}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {activePersona && (
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--hg-surface)] border border-[var(--hg-border)] text-xs text-[var(--hg-text-secondary)]">
                                <span>{personas.find(p => p.id === activePersona)?.name ?? 'Custom'}</span>
                                <button
                                    onClick={() => setActivePersona('')}
                                    className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)]"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        <HyggeButton
                            variant="icon"
                            onClick={() => setRightOpen(!rightOpen)}
                            title="Toggle agents"
                        >
                            ⊞
                        </HyggeButton>
                    </div>
                </div>

                {/* Messages */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8 pb-4"
                >
                    {isLoadingConversation && (
                        <div className="flex flex-col max-w-3xl mx-auto w-full space-y-6">
                            {[false, true, false, true].map((isUser, i) => (
                                <div key={i} className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
                                    <div className={clsx(
                                        'animate-pulse rounded bg-[var(--hg-surface)]',
                                        isUser ? 'h-10 w-1/2' : 'h-16 w-2/3'
                                    )} />
                                </div>
                            ))}
                        </div>
                    )}

                    {!isLoadingConversation && messages.length === 0 && !isStreaming && emptyState}

                    {messages.map((m, i) => (
                        <div key={i} className={clsx(
                            'flex flex-col max-w-3xl mx-auto',
                            m.role === 'user' ? 'items-end' : 'items-start'
                        )}>
                            <div className={clsx(
                                'px-4 py-3 text-sm',
                                m.role === 'user'
                                    ? 'bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[var(--hg-text-primary)]'
                                    : 'border-l-2 border-[var(--hg-accent)] pl-4 text-[var(--hg-text-primary)]'
                            )}>
                                <MessageContent
                                    content={m.content}
                                    role={m.role}
                                    isStreaming={isStreaming && i === messages.length - 1 && m.role === 'assistant'}
                                />
                            </div>

                            {/* Injected context (only on last assistant message) */}
                            {m.role === 'assistant' && i === messages.length - 1 && injectedContext.length > 0 && (
                                <InjectedContextPanel
                                    items={injectedContext}
                                    onFeedback={handleFeedback}
                                    ratedItems={ratedItems}
                                />
                            )}

                            {/* Result meta (last assistant message only) */}
                            {m.role === 'assistant' && i === messages.length - 1 && resultMeta && (
                                <div className="mt-1 flex items-center gap-4 text-[10px] text-[var(--hg-text-tertiary)] ml-4">
                                    <span>{resultMeta.model}</span>
                                    <span>{resultMeta.tokensUsed} tokens</span>
                                    {resultMeta.agentUsed && <span>{resultMeta.agentUsed}</span>}
                                </div>
                            )}
                        </div>
                    ))}

                    {streamError && (
                        <div className="max-w-3xl mx-auto px-4 py-2 text-xs text-[var(--hg-destructive)] border-l-2 border-[var(--hg-destructive)]">
                            {streamError}
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Scroll-to-bottom FAB */}
                {isScrolledUp && !isStreaming && (
                    <button
                        onClick={scrollToBottom}
                        className="absolute bottom-24 right-6 z-10 w-8 h-8 flex items-center justify-center bg-[var(--hg-surface)] border border-[var(--hg-border)] text-[var(--hg-text-secondary)] hover:text-[var(--hg-accent)] hover:border-[var(--hg-accent)] shadow-sm transition-colors"
                        title="Scroll to bottom"
                    >
                        ↓
                    </button>
                )}

                {/* Omnibar */}
                <div className="px-4 md:px-8 py-4 border-t border-[var(--hg-border)] shrink-0">
                    <div className="max-w-3xl mx-auto">
                        <Omnibar
                            onSend={(content, attachments) => sendMessage(content, attachments)}
                            isStreaming={isStreaming}
                            providers={providers}
                            selectedProvider={selectedProvider}
                            onProviderChange={setSelectedProvider}
                            {...(activeProjectId && projects.find(p => p.id === activeProjectId)?.name
                                ? { projectName: projects.find(p => p.id === activeProjectId)!.name }
                                : {}
                            )}
                        />
                    </div>
                </div>
            </div>

            {/* Right drawer */}
            <div className={clsx(
                'flex-shrink-0 transition-all duration-200 border-l border-[var(--hg-border)]',
                rightOpen ? 'w-56' : 'w-0 overflow-hidden border-l-0'
            )}>
                <AgentDrawer
                    personas={personas}
                    activePersonaId={activePersona}
                    isOpen={rightOpen}
                    onSelectPersona={setActivePersona}
                    onClearPersona={() => setActivePersona('')}
                    onCreatePersona={handleCreatePersona}
                    onDeletePersona={handleDeletePersona}
                    onClose={() => setRightOpen(false)}
                />
            </div>

            {/* New project modal */}
            {showNewProjectModal && (
                <NewProjectModal
                    onSubmit={handleCreateProject}
                    onClose={() => setShowNewProjectModal(false)}
                />
            )}
        </div>
    )
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="p-8 text-[var(--hg-text-tertiary)]">Loading...</div>}>
            <ChatPageContent />
        </Suspense>
    )
}
