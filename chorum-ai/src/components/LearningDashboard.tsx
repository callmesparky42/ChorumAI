'use client'

import { useState, useEffect } from 'react'
import {
    Shield, FileCode, Zap, TrendingUp, TrendingDown, Plus, Trash2,
    Pencil, X, Check, AlertTriangle, CheckCircle2, Loader2, RefreshCw,
    ChevronDown, ChevronRight, Sparkles
} from 'lucide-react'
import clsx from 'clsx'

interface LearningItem {
    id: string
    projectId: string
    type: 'pattern' | 'antipattern' | 'decision' | 'invariant' | 'golden_path'
    content: string
    context?: string | null
    metadata?: {
        checkType?: string
        checkValue?: string
        sourceMessageId?: string
        learnedFromUser?: string
        violationCount?: number
        [key: string]: unknown
    } | null
    createdAt: Date | null
}

interface ConfidenceMetric {
    id: string
    projectId: string
    score: number
    decayRate: number
    lastDecayAt: Date | null
    interactionCount: number | null
    positiveInteractionCount: number | null
    updatedAt: Date | null
}

interface FileMetadata {
    id: string
    projectId: string
    filePath: string
    isCritical: boolean
    linkedInvariants: string[] | null
    updatedAt: Date | null
}

interface LearningDashboardProps {
    projectId: string
    projectName?: string
}

const TYPE_CONFIG = {
    invariant: {
        label: 'Invariants',
        icon: Shield,
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        description: 'Rules that must always be followed'
    },
    pattern: {
        label: 'Patterns',
        icon: Zap,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        description: 'Detected coding patterns'
    },
    antipattern: {
        label: 'Antipatterns',
        icon: AlertTriangle,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/30',
        description: 'Things to avoid'
    },
    decision: {
        label: 'Decisions',
        icon: CheckCircle2,
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        description: 'Key project decisions'
    },
    golden_path: {
        label: 'Golden Paths',
        icon: TrendingUp,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        description: 'Recommended approaches'
    }
}

export function LearningDashboard({ projectId, projectName }: LearningDashboardProps) {
    const [items, setItems] = useState<LearningItem[]>([])
    const [confidence, setConfidence] = useState<ConfidenceMetric | null>(null)
    const [criticalFiles, setCriticalFiles] = useState<FileMetadata[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // UI State
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        invariant: true,
        pattern: true,
        antipattern: false,
        decision: false,
        golden_path: false,
        files: true
    })
    const [editingItem, setEditingItem] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [editContext, setEditContext] = useState('')
    const [showAddModal, setShowAddModal] = useState(false)
    const [addType, setAddType] = useState<LearningItem['type']>('invariant')
    const [addContent, setAddContent] = useState('')
    const [addContext, setAddContext] = useState('')
    const [saving, setSaving] = useState(false)

    // Analysis State
    const [analyzingLinks, setAnalyzingLinks] = useState(false)
    const [linkAnalysisResult, setLinkAnalysisResult] = useState<{ success: boolean; message: string } | null>(null)

    useEffect(() => {
        if (projectId) {
            fetchData()
        }
    }, [projectId])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const [itemsRes, confidenceRes, filesRes] = await Promise.all([
                fetch(`/api/learning?projectId=${projectId}`),
                fetch(`/api/learning?projectId=${projectId}&confidence=true`),
                fetch(`/api/learning?projectId=${projectId}&criticalFiles=true`)
            ])

            if (itemsRes.ok) {
                const data = await itemsRes.json()
                setItems(data.items || [])
            }
            if (confidenceRes.ok) {
                const data = await confidenceRes.json()
                setConfidence(data.confidence || null)
            }
            if (filesRes.ok) {
                const data = await filesRes.json()
                setCriticalFiles(data.criticalFiles || [])
            }
        } catch (e) {
            console.error('Failed to fetch learning data:', e)
            setError('Failed to load learning data')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this learning item?')) return
        try {
            const res = await fetch(`/api/learning?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                setItems(items.filter(i => i.id !== id))
            }
        } catch (e) {
            console.error('Failed to delete:', e)
        }
    }

    const handleEdit = async (id: string) => {
        setSaving(true)
        try {
            const res = await fetch('/api/learning', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    content: editContent,
                    context: editContext || null
                })
            })
            if (res.ok) {
                setItems(items.map(i =>
                    i.id === id ? { ...i, content: editContent, context: editContext || null } : i
                ))
                setEditingItem(null)
            }
        } catch (e) {
            console.error('Failed to update:', e)
        } finally {
            setSaving(false)
        }
    }

    const handleAdd = async () => {
        if (!addContent.trim()) return
        setSaving(true)
        try {
            const res = await fetch('/api/learning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    type: addType,
                    content: addContent,
                    context: addContext || undefined
                })
            })
            if (res.ok) {
                const data = await res.json()
                setItems([...items, data.item])
                setShowAddModal(false)
                setAddContent('')
                setAddContext('')
            }
        } catch (e) {
            console.error('Failed to add:', e)
        } finally {
            setSaving(false)
        }
    }

    const startEdit = (item: LearningItem) => {
        setEditingItem(item.id)
        setEditContent(item.content)
        setEditContext(item.context || '')
    }

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    // Group items by type
    const itemsByType = items.reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = []
        acc[item.type].push(item)
        return acc
    }, {} as Record<string, LearningItem[]>)

    if (loading) {
        return (
            <div className="flex justify-center items-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center p-12">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2 mx-auto"
                >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Invariants</p>
                    <p className="text-2xl font-bold text-red-400">{itemsByType.invariant?.length || 0}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Patterns</p>
                    <p className="text-2xl font-bold text-blue-400">{(itemsByType.pattern?.length || 0) + (itemsByType.golden_path?.length || 0)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Critical Files</p>
                    <p className="text-2xl font-bold text-purple-400">{criticalFiles.length}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Confidence</p>
                    <div className="flex items-center gap-2">
                        <p className={clsx(
                            "text-2xl font-bold",
                            (confidence?.score || 0) >= 80 ? "text-green-400" :
                                (confidence?.score || 0) >= 50 ? "text-yellow-400" : "text-red-400"
                        )}>
                            {confidence?.score?.toFixed(1) || '—'}%
                        </p>
                        {confidence && confidence.score < 100 && (
                            <TrendingDown className="w-4 h-4 text-gray-500" />
                        )}
                    </div>
                </div>
            </div>

            {/* Confidence Details */}
            {confidence && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium text-white flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-400" />
                                Project Confidence Score
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Based on {confidence.interactionCount || 0} interactions
                                ({confidence.positiveInteractionCount || 0} positive)
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={clsx(
                                        "h-full rounded-full transition-all",
                                        (confidence.score || 0) >= 80 ? "bg-green-500" :
                                            (confidence.score || 0) >= 50 ? "bg-yellow-500" : "bg-red-500"
                                    )}
                                    style={{ width: `${confidence.score || 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Decay rate: {((1 - (confidence.decayRate || 0.99)) * 100).toFixed(1)}%/day
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Knowledge Graph Analysis Tool */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-medium text-white flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            Knowledge Graph Analysis
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Analyze co-occurrence data to infer logical relationships and clean up the graph.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {linkAnalysisResult && (
                            <span className={clsx("text-sm", linkAnalysisResult.success ? "text-green-400" : "text-yellow-400")}>
                                {linkAnalysisResult.message}
                            </span>
                        )}
                        <button
                            onClick={async () => {
                                if (!projectId) return
                                setAnalyzingLinks(true)
                                setLinkAnalysisResult(null)
                                try {
                                    const res = await fetch('/api/learning/analyze-links', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ projectId })
                                    })
                                    const data = await res.json()
                                    if (data.success) {
                                        setLinkAnalysisResult({ success: true, message: data.message })
                                    } else {
                                        setLinkAnalysisResult({ success: false, message: data.message || data.error })
                                    }
                                } catch (e: any) {
                                    setLinkAnalysisResult({ success: false, message: e.message })
                                } finally {
                                    setAnalyzingLinks(false)
                                }
                            }}
                            disabled={analyzingLinks || !projectId}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-2 shadow-sm"
                        >
                            {analyzingLinks ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Analyze
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Add Item Button */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium flex items-center gap-2 text-white shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Learning Item
                </button>
            </div>

            {/* Learning Sections */}
            {(['invariant', 'pattern', 'antipattern', 'decision', 'golden_path'] as const).map(type => {
                const config = TYPE_CONFIG[type]
                const typeItems = itemsByType[type] || []
                const Icon = config.icon

                return (
                    <div key={type} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                        <button
                            onClick={() => toggleSection(type)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Icon className={clsx("w-5 h-5", config.color)} />
                                <span className="font-medium">{config.label}</span>
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-xs",
                                    config.bgColor, config.color
                                )}>
                                    {typeItems.length}
                                </span>
                            </div>
                            {expandedSections[type] ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                        </button>

                        {expandedSections[type] && (
                            <div className="border-t border-gray-800">
                                {typeItems.length === 0 ? (
                                    <p className="px-4 py-6 text-center text-gray-500 text-sm">
                                        No {config.label.toLowerCase()} learned yet
                                    </p>
                                ) : (
                                    <div className="divide-y divide-gray-800">
                                        {typeItems.map(item => (
                                            <div key={item.id} className="px-4 py-3 hover:bg-gray-900/30">
                                                {editingItem === item.id ? (
                                                    <div className="space-y-3">
                                                        <textarea
                                                            value={editContent}
                                                            onChange={e => setEditContent(e.target.value)}
                                                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                                            rows={2}
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editContext}
                                                            onChange={e => setEditContext(e.target.value)}
                                                            placeholder="Context (optional)"
                                                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => setEditingItem(null)}
                                                                className="p-2 text-gray-500 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleEdit(item.id)}
                                                                disabled={saving}
                                                                className="p-2 text-green-500 hover:bg-green-900/20 hover:text-green-400 rounded-lg transition-colors"
                                                            >
                                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-gray-200 text-sm">
                                                                {type === 'invariant' && <span className="text-red-400 mr-2">✓</span>}
                                                                {type === 'antipattern' && <span className="text-orange-400 mr-2">⚠️</span>}
                                                                {type === 'pattern' && <span className="text-blue-400 mr-2">🔄</span>}
                                                                {type === 'decision' && <span className="text-green-400 mr-2">📋</span>}
                                                                {type === 'golden_path' && <span className="text-yellow-400 mr-2">⭐</span>}
                                                                "{item.content}"
                                                            </p>
                                                            {item.context && (
                                                                <p className="text-xs text-gray-500 mt-1 truncate">
                                                                    {item.context}
                                                                </p>
                                                            )}
                                                            {item.metadata?.violationCount && item.metadata.violationCount > 0 && (
                                                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    violated {item.metadata.violationCount}x
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => startEdit(item)}
                                                                className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(item.id)}
                                                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Critical Files Section */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <button
                    onClick={() => toggleSection('files')}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <FileCode className="w-5 h-5 text-purple-400" />
                        <span className="font-medium">Critical Files</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-400">
                            {criticalFiles.length}
                        </span>
                    </div>
                    {expandedSections.files ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                </button>

                {expandedSections.files && (
                    <div className="border-t border-gray-800">
                        {criticalFiles.length === 0 ? (
                            <p className="px-4 py-6 text-center text-gray-500 text-sm">
                                No critical files marked
                            </p>
                        ) : (
                            <div className="divide-y divide-gray-800">
                                {criticalFiles.map(file => (
                                    <div key={file.id} className="px-4 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <FileCode className="w-4 h-4 text-purple-400" />
                                            <span className="text-sm font-mono text-gray-300">{file.filePath}</span>
                                        </div>
                                        {file.linkedInvariants && file.linkedInvariants.length > 0 && (
                                            <span className="text-xs text-gray-500">
                                                linked to {file.linkedInvariants.length} invariant(s)
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
                        <h3 className="text-lg font-medium mb-4">Add Learning Item</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2">Type</label>
                                <select
                                    value={addType}
                                    onChange={e => setAddType(e.target.value as LearningItem['type'])}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white"
                                >
                                    <option value="invariant">Invariant (must follow)</option>
                                    <option value="pattern">Pattern (detected)</option>
                                    <option value="antipattern">Antipattern (avoid)</option>
                                    <option value="decision">Decision (rationale)</option>
                                    <option value="golden_path">Golden Path (recommended)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2">Content</label>
                                <textarea
                                    value={addContent}
                                    onChange={e => setAddContent(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    rows={3}
                                    placeholder={
                                        addType === 'invariant' ? "Always use TypeScript strict mode" :
                                            addType === 'antipattern' ? "Never expose API keys in client code" :
                                                addType === 'decision' ? "Using PostgreSQL for persistence" :
                                                    addType === 'golden_path' ? "Error handling uses try-catch with specific messages" :
                                                        "Pattern description..."
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2">Context (optional)</label>
                                <input
                                    type="text"
                                    value={addContext}
                                    onChange={e => setAddContext(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    placeholder="Why this matters or when it applies..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={() => { setShowAddModal(false); setAddContent(''); setAddContext('') }}
                                    className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    disabled={saving || !addContent.trim()}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm"
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Add Item
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
