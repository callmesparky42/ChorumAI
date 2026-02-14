'use client'
import { useState, useEffect } from 'react'
import { Plus, Folder, Loader2, Settings, X, ChevronDown, ChevronRight, MessageSquare, PlusCircle, Upload, Archive, User, Trash, FileText } from 'lucide-react'
import { ProjectSettingsModal } from './ProjectSettingsModal'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useChorumStore } from '@/lib/store'
import { prepareImportPayload, ImportPayload } from '@/lib/portability/intake'
import { HyggeButton } from './hygge/HyggeButton'

interface ProjectDocument {
    id: string
    filename: string
    mimeType: string
    uploadedAt: string
    extractedLearningIds?: string[]
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

interface ProjectItemProps {
    project: Project
    isActive: boolean
    isHovered: boolean
    onSelect: () => void
    onSelectConversation: (conversationId: string) => void
    onNewConversation: () => void
    onDelete: (e: React.MouseEvent) => void
    onDeleteConversation: (conversationId: string, e: React.MouseEvent) => void
    onHover: (id: string | null) => void
    refreshTrigger: number
    onOpenSettings: (e: React.MouseEvent) => void
    deletingId: string | null
    activeConversationId?: string | null
}

function ProjectItem({ project, isActive, isHovered, onSelect, onSelectConversation, onNewConversation, onDelete, onDeleteConversation, onHover, refreshTrigger, onOpenSettings, deletingId, activeConversationId }: ProjectItemProps) {
    const [expanded, setExpanded] = useState(false)
    const { conversations: allConversations, isConversationsLoading, fetchConversations, deleteConversation } = useChorumStore()
    const conversations = allConversations[project.id] || []
    const loadingConvos = isConversationsLoading[project.id] || false

    // Project documents state
    const [documents, setDocuments] = useState<ProjectDocument[]>([])
    const [loadingDocs, setLoadingDocs] = useState(false)
    const [showDocs, setShowDocs] = useState(false)
    const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

    // Fetch conversations when component mounts, project becomes active, or refresh is triggered
    const handleFetchConversations = async (force = false) => {
        await fetchConversations(project.id, force)
    }

    // Fetch project documents
    const fetchDocuments = async () => {
        setLoadingDocs(true)
        try {
            const res = await fetch(`/api/documents?projectId=${project.id}`)
            if (res.ok) {
                const data = await res.json()
                setDocuments(data)
            }
        } catch (e) {
            console.error('Failed to load documents', e)
        } finally {
            setLoadingDocs(false)
        }
    }

    // Delete a document
    const handleDeleteDocument = async (docId: string, cascade: boolean) => {
        setDeletingDocId(docId)
        try {
            const res = await fetch(`/api/documents?id=${docId}&cascade=${cascade}`, { method: 'DELETE' })
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== docId))
            } else {
                alert('Failed to delete document')
            }
        } catch (e) {
            console.error('Failed to delete document', e)
            alert('Error deleting document')
        } finally {
            setDeletingDocId(null)
        }
    }

    // Initial fetch
    useEffect(() => {
        handleFetchConversations()
    }, [project.id])

    // Refresh when trigger changes (new conversation created)
    useEffect(() => {
        if (refreshTrigger > 0 && isActive) {
            handleFetchConversations(true)
            fetchDocuments()
        }
    }, [refreshTrigger, isActive])

    // Auto-expand active project
    useEffect(() => {
        if (isActive && !expanded) {
            setExpanded(true)
            handleFetchConversations(true)
        }
    }, [isActive])

    // Auto-select first conversation if project is active but no conversation is selected
    useEffect(() => {
        if (isActive && conversations.length > 0 && !activeConversationId && !loadingConvos) {
            onSelectConversation(conversations[0].id)
        }
    }, [isActive, conversations, activeConversationId, loadingConvos])

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!expanded) {
            handleFetchConversations()
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
                        "flex-1 text-left px-2 py-1.5 rounded-r-lg text-sm transition-all flex items-center gap-2 border-l-2",
                        isActive
                            ? "bg-blue-600/10 text-blue-400 font-medium border-blue-500"
                            : "border-transparent text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                    )}
                >
                    <Folder className={clsx("w-4 h-4 shrink-0", isActive ? "text-blue-500" : "text-gray-600")} />
                    <span className="truncate flex-1">{project.name}</span>
                </button>
                {isHovered && (
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                        <button
                            onClick={onOpenSettings}
                            className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                            title="Project Settings"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            title="Delete project"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Conversations */}
            {expanded && (
                <div className="ml-6 mt-1 space-y-0.5">
                    {/* New Chat Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onNewConversation()
                        }}
                        className="w-full text-left px-2 py-1.5 rounded text-xs text-blue-400 hover:bg-blue-600/10 hover:text-blue-300 flex items-center gap-2 transition-colors"
                    >
                        <PlusCircle className="w-3 h-3 shrink-0" />
                        <span>New Chat</span>
                    </button>

                    {loadingConvos && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                        </div>
                    )}
                    {!loadingConvos && conversations.length === 0 && (
                        <div className="text-xs text-gray-600 py-1 px-2">No conversations yet</div>
                    )}
                    {conversations.map((convo) => (
                        <div
                            key={convo.id}
                            className="group/convo relative"
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onSelectConversation(convo.id)
                                }}
                                className={clsx(
                                    "w-full text-left px-2 py-1.5 rounded-r text-xs flex items-center gap-2 transition-colors border-l-2",
                                    activeConversationId === convo.id
                                        ? "bg-blue-600/10 text-blue-400 font-medium border-blue-500"
                                        : "border-transparent text-gray-500 hover:bg-gray-900 hover:text-gray-300"
                                )}
                                title={convo.preview || convo.title}
                            >
                                <MessageSquare className={clsx(
                                    "w-3 h-3 shrink-0",
                                    activeConversationId === convo.id ? "text-blue-500" : "text-gray-600"
                                )} />
                                <span className="truncate flex-1">
                                    {convo.title}
                                </span>
                                <span className={clsx(
                                    "text-[10px] transition-opacity",
                                    activeConversationId === convo.id ? "text-blue-500/60" : "text-gray-700 group-hover/convo:opacity-0"
                                )}>{convo.messageCount}</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDeleteConversation(convo.id, e)
                                }}
                                disabled={deletingId === convo.id}
                                className={clsx(
                                    "absolute right-1 top-1.5 p-0.5 text-gray-600 transition-all",
                                    deletingId === convo.id
                                        ? "opacity-100 cursor-wait"
                                        : "hover:text-red-400 opacity-0 group-hover/convo:opacity-100"
                                )}
                                title="Delete conversation"
                            >
                                {deletingId === convo.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-red-500" />
                                ) : (
                                    <Trash className="w-3 h-3" />
                                )}
                            </button>
                        </div>
                    ))}

                    {/* Project Files Section */}
                    <div className="mt-2 pt-2 border-t border-gray-800/50">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (!showDocs && documents.length === 0) {
                                    fetchDocuments()
                                }
                                setShowDocs(!showDocs)
                            }}
                            className="w-full text-left px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-900 hover:text-gray-400 flex items-center gap-2 transition-colors"
                        >
                            {showDocs ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="flex-1">Project Files</span>
                            {documents.length > 0 && (
                                <span className="text-gray-700 text-[10px]">{documents.length}</span>
                            )}
                        </button>

                        {showDocs && (
                            <div className="ml-4 mt-1 space-y-0.5">
                                {loadingDocs && (
                                    <div className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                                    </div>
                                )}
                                {!loadingDocs && documents.length === 0 && (
                                    <div className="text-xs text-gray-600 py-1 px-2">No files stored</div>
                                )}
                                {documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="group/doc relative"
                                    >
                                        <div
                                            className="w-full text-left px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-900 hover:text-gray-400 flex items-center gap-2 transition-colors"
                                            title={`${doc.filename}\nLearnings: ${doc.extractedLearningIds?.length || 0}`}
                                        >
                                            <FileText className="w-3 h-3 shrink-0 text-emerald-600/70" />
                                            <span className="truncate flex-1">{doc.filename}</span>
                                            {doc.extractedLearningIds && doc.extractedLearningIds.length > 0 && (
                                                <span className="text-emerald-600/60 text-[9px]">{doc.extractedLearningIds.length}</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                const hasLearnings = doc.extractedLearningIds && doc.extractedLearningIds.length > 0
                                                const cascade = hasLearnings
                                                    ? confirm(`Delete "${doc.filename}"?\n\nThis file has ${doc.extractedLearningIds?.length} linked learnings.\n\nClick OK to delete file AND learnings.\nClick Cancel to keep everything.`)
                                                    : confirm(`Delete "${doc.filename}"?`)
                                                if (cascade !== undefined && cascade !== false) {
                                                    handleDeleteDocument(doc.id, hasLearnings ? true : false)
                                                }
                                            }}
                                            disabled={deletingDocId === doc.id}
                                            className={clsx(
                                                "absolute right-1 top-1 p-0.5 text-gray-600 transition-all",
                                                deletingDocId === doc.id
                                                    ? "opacity-100 cursor-wait"
                                                    : "hover:text-red-400 opacity-0 group-hover/doc:opacity-100"
                                            )}
                                            title="Delete file"
                                        >
                                            {deletingDocId === doc.id ? (
                                                <Loader2 className="w-3 h-3 animate-spin text-red-500" />
                                            ) : (
                                                <Trash className="w-3 h-3" />
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

interface Props {
    activeProjectId?: string | null
    onSelectProject: (projectId: string) => void
    onSelectConversation?: (conversationId: string) => void
}

export function Sidebar({ activeProjectId, onSelectProject, onSelectConversation }: Props) {
    const {
        projects,
        isProjectsLoading: loading,
        fetchProjects,
        deleteProject,
        deleteConversation,
        startNewConversation,
        conversationRefreshTrigger
    } = useChorumStore()

    const [showNewProjectModal, setShowNewProjectModal] = useState(false)
    const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
    const [settingsProject, setSettingsProject] = useState<Project | null>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const router = useRouter()
    const searchParams = useSearchParams()
    const activeConversationId = searchParams.get('conversationId')

    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newInstructions, setNewInstructions] = useState('')

    // Import State
    const [showImportPasswordModal, setShowImportPasswordModal] = useState(false)
    const [importPassword, setImportPassword] = useState('')
    const [pendingImportData, setPendingImportData] = useState<any>(null)

    // New Universal Import State
    const [showUniversalImportModal, setShowUniversalImportModal] = useState(false)
    const [universalImportPayload, setUniversalImportPayload] = useState<ImportPayload | null>(null)

    useEffect(() => {
        handleInitialFetch()
    }, [])

    const handleInitialFetch = async () => {
        await fetchProjects()
        // Select first project if none active and projects exist
        if (!activeProjectId && projects.length > 0) {
            onSelectProject(projects[0].id)
        }
    }

    // Auto-select first project if projects load and none active
    useEffect(() => {
        if (!activeProjectId && projects.length > 0 && !loading) {
            onSelectProject(projects[0].id)
        }
    }, [projects, activeProjectId, loading])

    const performUniversalImport = async (payload: ImportPayload, storeConversations: boolean) => {
        if (!activeProjectId) return

        setIsImporting(true)
        try {
            const res = await fetch('/api/import/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: activeProjectId,
                    data: payload.type === 'json' ? payload.data : undefined,
                    rawText: payload.type === 'text' ? payload.text : undefined,
                    fileHint: payload.hint,
                    storeConversations
                })
            })

            const result = await res.json()
            if (res.ok && result.success) {
                alert(`Import successful!\n\nformat: ${result.format}\nqueued: ${result.queued}\n\n${result.message}`)
                // Refresh conversations if we are on the active project
                if (activeProjectId === result.projectId) {
                    useChorumStore.getState().triggerConversationRefresh()
                }
            } else {
                console.error('Import failed', result)
                alert(`Import failed: ${result.error || 'Unknown error'}\n\n${result.parseWarnings?.join('\n')}`)
            }
        } catch (error: any) {
            console.error('Import request failed', error)
            alert(`Import failed: ${error.message}`)
        } finally {
            setIsImporting(false)
            setShowUniversalImportModal(false)
            setUniversalImportPayload(null)
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
                // Update store by re-fetching
                await fetchProjects(true)
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
            await deleteProject(projectId)
            // If deleted project was active, select another
            const remainingProjects = projects.filter(p => p.id !== projectId)
            if (activeProjectId === projectId && remainingProjects.length > 0) {
                onSelectProject(remainingProjects[0].id)
            }
        } catch (error: any) {
            console.error('Failed to delete project', error)
            alert(`Failed to delete project: ${error.message}`)
        }
    }

    const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return

        setDeletingId(conversationId)
        try {
            // Check if this is the active conversation BEFORE deleting
            const currentConversationId = searchParams.get('conversationId')

            await deleteConversation(conversationId)

            // If we deleted the active conversation, navigate to the project root to clear the view
            if (currentConversationId === conversationId) {
                router.push(`/app?project=${activeProjectId || ''}`)
            }
        } catch (error) {
            console.error('Failed to delete conversation', error)
            alert('Error deleting conversation')
        } finally {
            setDeletingId(null)
        }
    }

    const performImport = async (data: any, password?: string) => {
        try {
            const res = await fetch('/api/import/project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exportData: data,
                    options: {
                        mergeExisting: false,
                        importConversations: true,
                        password
                    }
                })
            })

            // Check content type to avoid JSON parse errors on HTML responses
            const contentType = res.headers.get('content-type')
            if (!contentType || !contentType.includes('application/json')) {
                const text = await res.text()
                console.error('Import API returned non-JSON:', res.status, text)
                throw new Error(`Server returned ${res.status} ${res.statusText}: ${text.slice(0, 100)}...`)
            }

            const result = await res.json()
            if (res.ok && result.success) {
                alert(`Project imported successfully! Imported ${result.stats.patternsImported} patterns.`)
                fetchProjects() // Refresh list
                onSelectProject(result.projectId)
                // Cleanup
                setShowImportPasswordModal(false)
                setPendingImportData(null)
                setImportPassword('')
            } else {
                throw new Error(result.error || 'Import failed')
            }
        } catch (error: any) {
            console.error('Import failed', error)
            alert(`Failed to import project: ${error.message || 'Unknown error'}`)
        } finally {
            setIsImporting(false)
        }
    }

    const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsImporting(true)
        try {
            const text = await file.text()
            const ext = file.name.split('.').pop()

            const payload = prepareImportPayload(text, ext)

            // 1. Check for Chorum Native (JSON + metadata + project)
            if (payload.type === 'json') {
                const data = payload.data as any
                if (data.metadata && data.project) {
                    // Check for encryption
                    if (data._encrypted) {
                        setPendingImportData(data)
                        setShowImportPasswordModal(true)
                        setIsImporting(false)
                    } else {
                        await performImport(data)
                    }
                    e.target.value = ''
                    return
                }
            }

            // 2. Foreign JSON or Text -> Show Confirmation
            // We need active project to import INTO
            if (!activeProjectId) {
                alert('Please select a project first to import conversations into.')
                setIsImporting(false)
                e.target.value = ''
                return
            }

            setUniversalImportPayload(payload)
            setShowUniversalImportModal(true)
            setIsImporting(false)

        } catch (error) {
            console.error('File parse failed', error)
            alert('Failed to process file.')
            setIsImporting(false)
        } finally {
            e.target.value = '' // Reset input
        }
    }

    const activeProjectName = projects.find(p => p.id === activeProjectId)?.name || 'Current Project'

    return (
        <>
            <div className="w-full h-full bg-gray-950 border-r border-gray-800 flex flex-col">
                <div className="p-4 border-b border-gray-800">
                    <img src="/logo.png" alt="Chorum AI" className="w-full h-auto object-contain max-h-32" />
                </div>

                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</h2>
                    <div className="flex items-center gap-2">
                        {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />}
                        <button
                            onClick={() => setShowNewProjectModal(true)}
                            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                            title="New Project"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {projects.map(project => (
                        <ProjectItem
                            key={project.id}
                            project={project}
                            isActive={activeProjectId === project.id}
                            onSelect={() => onSelectProject(project.id)}
                            onSelectConversation={(convId) => {
                                onSelectProject(project.id)
                                onSelectConversation?.(convId)
                            }}
                            onNewConversation={() => {
                                onSelectProject(project.id)
                                startNewConversation()
                            }}
                            onDelete={(e) => handleDeleteProject(e, project.id)}
                            onDeleteConversation={handleDeleteConversation}
                            deletingId={deletingId}
                            onHover={setHoveredProjectId}
                            isHovered={hoveredProjectId === project.id}
                            activeConversationId={activeConversationId}

                            refreshTrigger={conversationRefreshTrigger}
                            onOpenSettings={(e) => {
                                e.stopPropagation()
                                setSettingsProject(project)
                            }}
                        />
                    ))}

                    {!loading && projects.length === 0 && (
                        <div className="text-xs text-gray-600 p-4 text-center">No projects yet</div>
                    )}
                </div>


                <div className="p-3 border-t border-gray-800 flex items-center justify-between gap-1">
                    <Link
                        href="/settings"
                        className="p-2 hover:bg-gray-900 rounded-lg text-gray-400 hover:text-white transition-colors"
                        title="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </Link>

                    <label
                        className="p-2 hover:bg-gray-900 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                        title="Import Project"
                    >
                        {isImporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        <input type="file" accept=".json,.md,.txt,.csv" className="hidden" onChange={handleImportProject} disabled={isImporting} />
                    </label>

                    <button
                        className="p-2 hover:bg-gray-900 rounded-lg text-gray-400 hover:text-white transition-colors"
                        title="User Profile"
                    >
                        <User className="w-5 h-5" />
                    </button>
                </div>
            </div >

            {/* Settings Modal */}
            {
                settingsProject && (
                    <ProjectSettingsModal
                        project={settingsProject}
                        onClose={() => setSettingsProject(null)}
                        onUpdate={async (updatedProject) => {
                            await fetchProjects(true)
                            setSettingsProject(updatedProject)
                        }}
                    />
                )
            }


            {/* Modal */}
            {
                showNewProjectModal && (
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
                )
            }

            {/* Universal Import Confirmation Modal */}
            {
                showUniversalImportModal && universalImportPayload && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] rounded-xl w-full max-w-md p-6 shadow-2xl">
                            <h3 className="text-lg font-medium text-[var(--hg-text-primary)] mb-2">Import Conversation</h3>
                            <p className="text-sm text-[var(--hg-text-secondary)] mb-4">
                                Detected <strong>{universalImportPayload.hint === 'unknown' ? 'text' : universalImportPayload.hint}</strong> content.
                                <br />
                                Import into <strong>{projects.find(p => p.id === activeProjectId)?.name || 'Current Project'}</strong>?
                            </p>

                            <div className="bg-[var(--hg-bg)] p-3 rounded-lg text-xs text-[var(--hg-text-tertiary)] font-mono mb-6 max-h-32 overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--hg-bg)] pointer-events-none" />
                                {universalImportPayload.type === 'text'
                                    ? universalImportPayload.text?.slice(0, 200)
                                    : JSON.stringify(universalImportPayload.data, null, 2).slice(0, 200)
                                }...
                            </div>

                            <div className="flex justify-end gap-3 flex-wrap">
                                <HyggeButton
                                    variant="ghost"
                                    onClick={() => {
                                        setShowUniversalImportModal(false)
                                        setUniversalImportPayload(null)
                                    }}
                                    className="px-4"
                                >
                                    Cancel
                                </HyggeButton>
                                <HyggeButton
                                    variant="accent"
                                    onClick={() => performUniversalImport(universalImportPayload, true)}
                                    className="px-4"
                                >
                                    Import & Learn
                                </HyggeButton>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Import Password Modal */}
            {
                showImportPasswordModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                            <h3 className="text-lg font-medium text-white mb-2">Encrypted Project</h3>
                            <p className="text-sm text-gray-400 mb-4">Enter the password to decrypt and import this project.</p>

                            <form onSubmit={(e) => {
                                e.preventDefault()
                                setIsImporting(true)
                                performImport(pendingImportData, importPassword)
                            }} className="space-y-4">
                                <div>
                                    <input
                                        type="password"
                                        value={importPassword}
                                        onChange={e => setImportPassword(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                        placeholder="Enter password"
                                        autoFocus
                                        required
                                    />
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowImportPasswordModal(false)
                                            setPendingImportData(null)
                                            setImportPassword('')
                                        }}
                                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!importPassword}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                    >
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decrypt & Import'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </>
    )
}
