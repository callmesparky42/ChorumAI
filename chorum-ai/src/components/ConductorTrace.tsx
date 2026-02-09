'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Music, Pin, VolumeX, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface InjectedItem {
    id: string
    type: string
    content: string
    context?: string | null
    score?: number
    retrievalReason?: string
    pinnedAt?: string | null
    mutedAt?: string | null
}

interface RelevanceInfo {
    complexity: string
    budget: number
    itemsSelected: number
    latencyMs: number
    tier?: number
    tierLabel?: string
}

interface ConductorTraceProps {
    items: InjectedItem[]
    relevance?: RelevanceInfo
    detailedView?: boolean
    projectId: string
    className?: string
}

const TYPE_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
    invariant: { label: 'Rule', color: 'text-red-400', emoji: '🛡️' },
    pattern: { label: 'Pattern', color: 'text-blue-400', emoji: '🔄' },
    decision: { label: 'Decision', color: 'text-green-400', emoji: '📋' },
    golden_path: { label: 'Golden Path', color: 'text-yellow-400', emoji: '⭐' },
    antipattern: { label: 'Avoid', color: 'text-orange-400', emoji: '⚠️' }
}

export function ConductorTrace({
    items,
    relevance,
    detailedView = false,
    projectId,
    className
}: ConductorTraceProps) {
    const [expanded, setExpanded] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    if (items.length === 0) return null

    const tokenEstimate = relevance?.budget || 0

    const handleAction = async (itemId: string, action: 'pin' | 'unpin' | 'mute' | 'unmute') => {
        setActionLoading(`${itemId}-${action}`)
        try {
            await fetch('/api/conductor/items', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, action })
            })
        } catch (e) {
            console.error('Conductor action failed:', e)
        } finally {
            setActionLoading(null)
        }
    }

    const handleFeedback = async (itemId: string, signal: 'positive' | 'negative') => {
        setActionLoading(`${itemId}-${signal}`)
        try {
            await fetch('/api/conductor/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, signal })
            })
        } catch (e) {
            console.error('Feedback failed:', e)
        } finally {
            setActionLoading(null)
        }
    }

    return (
        <div className={clsx(
            "mt-2 border border-gray-800 rounded-lg overflow-hidden bg-gray-900/30",
            className
        )}>
            {/* Collapsed Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-900/50 transition-colors"
            >
                {expanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <Music className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-gray-400">
                    {items.length} item{items.length !== 1 ? 's' : ''} injected
                </span>
                {detailedView && relevance && (
                    <span className="text-xs text-gray-600 ml-2">
                        ({relevance.latencyMs}ms • {tokenEstimate} tokens)
                    </span>
                )}
            </button>

            {/* Expanded Content */}
            {expanded && (
                <div className="border-t border-gray-800">
                    {detailedView && relevance && (
                        <div className="px-3 py-2 bg-gray-950/50 text-xs text-gray-500 flex gap-4">
                            <span>Complexity: {relevance.complexity}</span>
                            {relevance.tier && <span>Tier: {relevance.tier} ({relevance.tierLabel})</span>}
                            <span>Budget: {relevance.budget} tokens</span>
                        </div>
                    )}

                    <div className="divide-y divide-gray-800/50">
                        {items.map((item) => {
                            const typeInfo = TYPE_LABELS[item.type] || {
                                label: item.type,
                                color: 'text-gray-400',
                                emoji: '📄'
                            }
                            const isPinned = !!item.pinnedAt

                            return (
                                <div
                                    key={item.id}
                                    className="px-3 py-2 hover:bg-gray-900/30"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span>{typeInfo.emoji}</span>
                                                <span className={clsx("text-xs font-medium", typeInfo.color)}>
                                                    {typeInfo.label}
                                                </span>
                                                {isPinned && (
                                                    <Pin className="w-3 h-3 text-purple-400" />
                                                )}
                                                {detailedView && item.score !== undefined && (
                                                    <span className="text-xs text-gray-600 ml-auto">
                                                        score: {item.score.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-300 line-clamp-2">
                                                {item.content}
                                            </p>
                                            {detailedView && item.retrievalReason && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {item.retrievalReason}
                                                </p>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleFeedback(item.id, 'positive')}
                                                disabled={actionLoading === `${item.id}-positive`}
                                                className="p-1 text-gray-600 hover:text-green-400 hover:bg-green-400/10 rounded transition-colors"
                                                title="Helpful"
                                            >
                                                {actionLoading === `${item.id}-positive` ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <ThumbsUp className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleFeedback(item.id, 'negative')}
                                                disabled={actionLoading === `${item.id}-negative`}
                                                className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                title="Not helpful"
                                            >
                                                {actionLoading === `${item.id}-negative` ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <ThumbsDown className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleAction(item.id, isPinned ? 'unpin' : 'pin')}
                                                disabled={actionLoading?.startsWith(item.id)}
                                                className={clsx(
                                                    "p-1 rounded transition-colors",
                                                    isPinned
                                                        ? "text-purple-400 hover:bg-purple-400/10"
                                                        : "text-gray-600 hover:text-purple-400 hover:bg-purple-400/10"
                                                )}
                                                title={isPinned ? "Unpin" : "Always include"}
                                            >
                                                {actionLoading === `${item.id}-pin` || actionLoading === `${item.id}-unpin` ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Pin className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleAction(item.id, 'mute')}
                                                disabled={actionLoading?.startsWith(item.id)}
                                                className="p-1 text-gray-600 hover:text-orange-400 hover:bg-orange-400/10 rounded transition-colors"
                                                title="Mute this item"
                                            >
                                                {actionLoading === `${item.id}-mute` ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <VolumeX className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
