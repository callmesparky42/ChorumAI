'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { Project } from '@/lib/shell/actions'

export type ConversationSummary = {
    id: string
    updated_at: string
    metadata: { firstMessageSnippet?: string }
}

export interface ProjectsDrawerProps {
    projects: Project[]
    unassignedConversations: ConversationSummary[]
    conversationsByProject: Record<string, ConversationSummary[]>
    activeProjectId: string | null
    activeConversationId: string
    isOpen: boolean
    loadingProjectId: string | null
    onSelectProject: (id: string | null) => void
    onSelectConversation: (id: string, projectId: string | null) => void
    onNewConversation: (projectId: string | null) => void
    onNewProject: () => void
    onDeleteProject: (id: string) => void
    onExpandProject: (id: string) => void
    onAssignToProject?: (conversationId: string, projectId: string) => void
    onDeleteConversation?: (id: string, projectId: string | null) => void
    onClose: () => void
}

export function ProjectsDrawer({
    projects,
    unassignedConversations,
    conversationsByProject,
    activeProjectId,
    activeConversationId,
    isOpen,
    loadingProjectId,
    onSelectProject,
    onSelectConversation,
    onNewConversation,
    onNewProject,
    onDeleteProject,
    onExpandProject,
    onAssignToProject,
    onDeleteConversation,
    onClose,
}: ProjectsDrawerProps) {
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
    const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
    const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)

    if (!isOpen) return null

    const toggleExpand = (id: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
                onExpandProject(id)
            }
            return next
        })
    }

    const snippet = (conv: ConversationSummary) =>
        conv.metadata?.firstMessageSnippet?.slice(0, 40) || 'New conversation'

    return (
        <div className="h-full flex flex-col bg-[var(--hg-surface)] border-r border-[var(--hg-border)] overflow-hidden w-60">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--hg-border)] shrink-0">
                <span className="text-xs font-medium text-[var(--hg-text-secondary)] uppercase tracking-wider">Projects</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onNewProject}
                        className="w-6 h-6 flex items-center justify-center text-[var(--hg-text-tertiary)] hover:text-[var(--hg-accent)] hover:bg-[var(--hg-surface-hover)] transition-colors"
                        title="New project"
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

            {/* Project list */}
            <div className="flex-1 overflow-y-auto py-1">
                {/* General / No Project */}
                <div
                    className={clsx(
                        'group flex items-center justify-between px-3 py-2 cursor-pointer select-none border-l-2',
                        'hover:bg-[var(--hg-surface-hover)] transition-colors',
                        activeProjectId === null
                            ? 'border-[var(--hg-accent)] bg-[var(--hg-surface)]'
                            : 'border-transparent'
                    )}
                    onClick={() => {
                        onSelectProject(null)
                    }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[var(--hg-text-tertiary)] text-xs shrink-0 w-3 text-center">
                            ⌂
                        </span>
                        <span className={clsx(
                            'text-xs truncate font-medium',
                            activeProjectId === null ? 'text-[var(--hg-text-primary)]' : 'text-[var(--hg-text-secondary)]'
                        )}>
                            Chats
                        </span>
                    </div>
                </div>

                <div className="px-3 py-2 mt-2">
                    <span className="text-[10px] text-[var(--hg-text-tertiary)] uppercase tracking-wider">Workspaces</span>
                </div>
                {projects.map(project => {
                    const isExpanded = expandedProjects.has(project.id)
                    const isActive = activeProjectId === project.id
                    const convs = conversationsByProject[project.id] ?? []
                    const isLoading = loadingProjectId === project.id

                    return (
                        <div key={project.id}>
                            {/* Project row */}
                            <div
                                className={clsx(
                                    'group flex items-center justify-between px-3 py-2 cursor-pointer select-none border-l-2',
                                    'hover:bg-[var(--hg-surface-hover)] transition-colors',
                                    isActive
                                        ? 'border-[var(--hg-accent)] bg-[var(--hg-surface)]'
                                        : dragOverProjectId === project.id
                                            ? 'border-[var(--hg-accent)] bg-[var(--hg-accent-muted)]'
                                            : 'border-transparent'
                                )}
                                onMouseEnter={() => setHoveredProjectId(project.id)}
                                onMouseLeave={() => setHoveredProjectId(null)}
                                onClick={() => {
                                    onSelectProject(project.id)
                                    toggleExpand(project.id)
                                }}
                                onDragOver={onAssignToProject ? (e) => {
                                    e.preventDefault()
                                    setDragOverProjectId(project.id)
                                } : undefined}
                                onDragLeave={onAssignToProject ? () => setDragOverProjectId(null) : undefined}
                                onDrop={onAssignToProject ? (e) => {
                                    e.preventDefault()
                                    setDragOverProjectId(null)
                                    const convId = e.dataTransfer.getData('text/conversation-id')
                                    if (convId) onAssignToProject(convId, project.id)
                                } : undefined}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-[var(--hg-text-tertiary)] text-[10px] shrink-0 w-3">
                                        {isExpanded ? '▾' : '▸'}
                                    </span>
                                    <span className={clsx(
                                        'text-xs truncate',
                                        isActive ? 'text-[var(--hg-text-primary)]' : 'text-[var(--hg-text-secondary)]'
                                    )}>
                                        {project.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {hoveredProjectId === project.id ? (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation()
                                                onDeleteProject(project.id)
                                            }}
                                            className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-destructive)] text-xs w-4 h-4 flex items-center justify-center"
                                            title="Delete project"
                                        >
                                            ×
                                        </button>
                                    ) : (
                                        <span className="text-[10px] text-[var(--hg-text-tertiary)]">
                                            {convs.length > 0 ? convs.length : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Expanded conversations */}
                            {isExpanded && (
                                <div className="pl-6 pb-1">
                                    {isLoading ? (
                                        <div className="py-1 px-3 text-[10px] text-[var(--hg-text-tertiary)]">Loading...</div>
                                    ) : (
                                        <>
                                            {convs.map(conv => (
                                                <div key={conv.id} className="group/conv flex items-center pr-2">
                                                    <button
                                                        onClick={() => onSelectConversation(conv.id, project.id)}
                                                        className={clsx(
                                                            'flex-1 text-left px-3 py-1.5 text-xs border-l-2 transition-colors truncate block min-w-0',
                                                            conv.id === activeConversationId
                                                                ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)]'
                                                                : 'border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]'
                                                        )}
                                                    >
                                                        {snippet(conv)}
                                                    </button>
                                                    {onDeleteConversation && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onDeleteConversation(conv.id, project.id)
                                                            }}
                                                            className="opacity-0 group-hover/conv:opacity-100 text-[var(--hg-text-tertiary)] hover:text-[var(--hg-destructive)] px-1 shrink-0"
                                                            title="Delete conversation"
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => onNewConversation(project.id)}
                                                className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--hg-accent)] hover:bg-[var(--hg-surface-hover)] transition-colors"
                                            >
                                                + New conversation
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* Unassigned / Recent */}
                {unassignedConversations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--hg-border-subtle)]">
                        <div className="px-3 py-1">
                            <span className="text-[10px] text-[var(--hg-text-tertiary)] uppercase tracking-wider">Recent</span>
                        </div>
                        {unassignedConversations.map(conv => (
                            <div key={conv.id} className="group/conv flex items-center pr-2">
                                <button
                                    draggable={!!onAssignToProject}
                                    onDragStart={onAssignToProject ? (e) => {
                                        e.dataTransfer.setData('text/conversation-id', conv.id)
                                        e.dataTransfer.effectAllowed = 'move'
                                    } : undefined}
                                    onClick={() => onSelectConversation(conv.id, null)}
                                    className={clsx(
                                        'flex-1 text-left px-4 py-1.5 text-xs border-l-2 transition-colors truncate block min-w-0',
                                        conv.id === activeConversationId
                                            ? 'border-[var(--hg-accent)] text-[var(--hg-text-primary)]'
                                            : 'border-transparent text-[var(--hg-text-secondary)] hover:text-[var(--hg-text-primary)] hover:bg-[var(--hg-surface-hover)]'
                                    )}
                                >
                                    {snippet(conv)}
                                </button>
                                {onDeleteConversation && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDeleteConversation(conv.id, null)
                                        }}
                                        className="opacity-0 group-hover/conv:opacity-100 text-[var(--hg-text-tertiary)] hover:text-[var(--hg-destructive)] px-1 shrink-0"
                                        title="Delete conversation"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
