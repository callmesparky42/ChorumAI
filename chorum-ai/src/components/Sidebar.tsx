'use client'
import { useState, useEffect } from 'react'
import { Plus, Folder, Loader2, Settings, X, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import Link from 'next/link'

interface Project {
    id: string
    name: string
    description?: string
    techStack?: string[]
    customInstructions?: string
}

interface Conversation {
    date: string
    firstMessageId: string
    lastMessageAt: string
    messageCount: number
    preview: string | null
}

interface ProjectItemProps {
    project: Project
    isActive: boolean
    isHovered: boolean
    onSelect: () => void
    onDelete: (e: React.MouseEvent) => void
    onHover: (id: string | null) => void
}

function ProjectItem({ project, isActive, isHovered, onSelect, onDelete, onHover }: ProjectItemProps) {
    const [expanded, setExpanded] = useState(false)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loadingConvos, setLoadingConvos] = useState(false)
    const [conversationCount, setConversationCount] = useState<number | null>(null)

    // Auto-fetch conversation count when component mounts or project becomes active
    useEffect(() => {
        const fetchConversationCount = async () => {
            try {
                const res = await fetch(`/api/conversations?projectId=${project.id}`)
                if (res.ok) {
                    const data = await res.json()
                    setConversationCount(data.length)
                    // Cache the data if we got it
                    if (data.length > 0) {
                        setConversations(data)
                    }
                }
            } catch (e) {
                console.error('Failed to load conversation count', e)
            }
        }
        fetchConversationCount()
    }, [project.id])

    const fetchConversations = async () => {
        if (conversations.length > 0) return // Already loaded
        setLoadingConvos(true)
        try {
            const res = await fetch(`/api/conversations?projectId=${project.id}`)
            if (res.ok) {
                const data = await res.json()
                setConversations(data)
                setConversationCount(data.length)
            }
        } catch (e) {
            console.error('Failed to load conversations', e)
        } finally {
            setLoadingConvos(false)
        }
    }

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!expanded) {
            fetchConversations()
        }
        setExpanded(!expanded)
    }

    return (
        <div
            className="relative group"
            onMouseEnter={() => onHover(project.id)}
            onMouseLeave={() => onHover(null)}
        >
            <div className="flex items-center">
                <button
                    onClick={handleExpand}
                    className="p-1 text-gray-600 hover:text-gray-400 transition-colors"
                >
                    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <button
                    onClick={onSelect}
                    className={clsx(
                        "flex-1 text-left px-2 py-2 rounded-lg text-sm transition-all flex items-center gap-2",
                        isActive
                            ? "bg-blue-600/10 text-blue-400 font-medium"
                            : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                    )}
                >
                    <Folder className={clsx("w-4 h-4 shrink-0", isActive ? "text-blue-500" : "text-gray-600")} />
                    <span className="truncate flex-1">{project.name}</span>
                </button>
                {isHovered && (
                    <button
                        onClick={onDelete}
                        className="absolute right-2 top-2 p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                        title="Delete project"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Conversations */}
            {expanded && (
                <div className="ml-6 mt-1 space-y-0.5">
                    {loadingConvos && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                        </div>
                    )}
                    {!loadingConvos && conversations.length === 0 && (
                        <div className="text-xs text-gray-600 py-1 px-2">No conversations yet</div>
                    )}
                    {conversations.map((convo) => (
                        <button
                            key={convo.date}
                            onClick={onSelect}
                            className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-gray-900 hover:text-gray-300 flex items-center gap-2 transition-colors"
                        >
                            <MessageSquare className="w-3 h-3 shrink-0 text-gray-600" />
                            <span className="truncate flex-1">
                                {convo.preview
                                    ? convo.preview.substring(0, 30) + (convo.preview.length > 30 ? '...' : '')
                                    : new Date(convo.date).toLocaleDateString()
                                }
                            </span>
                            <span className="text-gray-700 text-[10px]">{convo.messageCount}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

interface Props {
    activeProjectId?: string | null
    onSelectProject: (projectId: string) => void
}

export function Sidebar({ activeProjectId, onSelectProject }: Props) {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [showNewProjectModal, setShowNewProjectModal] = useState(false)
    const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)

    // New Project Form State
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newInstructions, setNewInstructions] = useState('')

    useEffect(() => {
        fetchProjects()
    }, [])

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/projects')
            if (res.ok) {
                const data = await res.json()
                setProjects(data)
                // Select first project if none active and projects exist
                if (!activeProjectId && data.length > 0) {
                    onSelectProject(data[0].id)
                }
            }
        } catch (error) {
            console.error('Failed to load projects', error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    description: newDesc,
                    customInstructions: newInstructions,
                    techStack: [] // TODO: Add UI for this
                })
            })

            if (res.ok) {
                const project = await res.json()
                setProjects([project, ...projects])
                onSelectProject(project.id)
                setShowNewProjectModal(false)
                setNewName('')
                setNewDesc('')
                setNewInstructions('')
            }
        } catch (error) {
            console.error('Failed to create project', error)
        }
    }

    const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation()
        if (!confirm('Delete this project? This cannot be undone.')) return

        try {
            const res = await fetch(`/api/projects?id=${projectId}`, { method: 'DELETE' })
            if (res.ok) {
                const newProjects = projects.filter(p => p.id !== projectId)
                setProjects(newProjects)
                // If deleted project was active, select another
                if (activeProjectId === projectId && newProjects.length > 0) {
                    onSelectProject(newProjects[0].id)
                }
            } else {
                const errorData = await res.json().catch(() => ({}))
                console.error('Delete failed:', res.status, errorData)
                alert(`Failed to delete project: ${errorData.error || res.statusText}`)
            }
        } catch (error) {
            console.error('Failed to delete project', error)
            alert('Failed to delete project. Check console for details.')
        }
    }

    return (
        <>
            <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col">
                {/* Logo */}
                <div className="p-4 border-b border-gray-800">
                    <img src="/logo.png" alt="Chorum AI" className="w-full h-auto object-contain" />
                </div>

                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</h2>
                    {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {projects.map(project => (
                        <ProjectItem
                            key={project.id}
                            project={project}
                            isActive={activeProjectId === project.id}
                            onSelect={() => onSelectProject(project.id)}
                            onDelete={(e) => handleDeleteProject(e, project.id)}
                            onHover={setHoveredProjectId}
                            isHovered={hoveredProjectId === project.id}
                        />
                    ))}

                    {!loading && projects.length === 0 && (
                        <div className="text-xs text-gray-600 p-4 text-center">No projects yet</div>
                    )}
                </div>


                <div className="p-3 border-t border-gray-800 space-y-2">
                    <Link
                        href="/settings"
                        className="w-full py-2.5 hover:bg-gray-900 rounded-lg text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                        <Settings className="w-4 h-4" />
                        Settings
                    </Link>
                    <button
                        onClick={() => setShowNewProjectModal(true)}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Project
                    </button>
                </div>
            </div>

            {/* Modal */}
            {showNewProjectModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-medium text-white mb-4">Create Project</h3>
                        <form onSubmit={handleCreateProject} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    placeholder="e.g. Website Redesign"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    placeholder="Brief goal..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Custom Instructions</label>
                                <textarea
                                    value={newInstructions}
                                    onChange={e => setNewInstructions(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 min-h-[100px]"
                                    placeholder="Any specific context for the AI..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowNewProjectModal(false)}
                                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    Create Project
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
