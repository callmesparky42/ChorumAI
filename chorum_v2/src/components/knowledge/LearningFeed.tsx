'use client'

import { useState, useCallback } from 'react'
import type { LearningItem, LearningFilters } from '@/lib/shell/knowledge-actions'
import {
    pinLearning, unpinLearning, muteLearning, unmuteLearning, deleteLearning,
} from '@/lib/shell/knowledge-actions'
import { timeAgo } from '@/lib/utils/time'

const HUMAN_TYPE: Record<string, string> = {
    invariant: 'Rule', pattern: 'Pattern', antipattern: 'Avoid',
    golden_path: 'How-to', decision: 'Decision', anchor: 'Anchor',
    character: 'Character', setting: 'Setting', plot_thread: 'Plot',
    voice: 'Voice', world_rule: 'World',
}

const TYPE_COLORS: Record<string, string> = {
    invariant: '#60a5fa', pattern: '#34d399', antipattern: '#f87171',
    golden_path: '#fbbf24', decision: '#a78bfa',
}


function statusBadge(item: LearningItem) {
    if (item.pinnedAt) return { label: 'Pinned', color: '#a78bfa' }
    if (item.mutedAt) return { label: 'Muted', color: '#71717a' }
    if (item.decayStrength > 0.2) return { label: 'Active', color: '#34d399' }
    return { label: 'Dormant', color: '#f87171' }
}

export function LearningFeed({
    items,
    total,
    page,
    pageSize,
    onPageChange,
    onItemClick,
    onRefresh,
}: {
    items: LearningItem[]
    total: number
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    onItemClick: (id: string) => void
    onRefresh: () => void
}) {
    const [menuOpen, setMenuOpen] = useState<string | null>(null)
    const totalPages = Math.ceil(total / pageSize) || 1

    const handleAction = useCallback(async (action: string, id: string) => {
        setMenuOpen(null)
        try {
            switch (action) {
                case 'pin': await pinLearning(id); break
                case 'unpin': await unpinLearning(id); break
                case 'mute': await muteLearning(id); break
                case 'unmute': await unmuteLearning(id); break
                case 'delete':
                    if (confirm('Delete this learning? This cannot be undone.')) {
                        await deleteLearning(id)
                    }
                    break
            }
            onRefresh()
        } catch { /* gracefully degrade */ }
    }, [onRefresh])

    return (
        <section className="mb-6">
            <div className="flex justify-end mb-2">
                <span className="text-[10px] text-[var(--hg-text-tertiary)] pt-1">
                    {total} total · page {page}/{totalPages}
                </span>
            </div>

            <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] overflow-x-auto">
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[var(--hg-text-tertiary)]">
                        <span className="text-3xl mb-3 opacity-20">▤</span>
                        <p className="text-sm">No learnings match your filters</p>
                    </div>
                ) : (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-[var(--hg-text-tertiary)] border-b border-[var(--hg-border)]">
                                <th className="text-left px-3 py-2 font-normal">Type</th>
                                <th className="text-left px-3 py-2 font-normal">Title</th>
                                <th className="text-left px-3 py-2 font-normal">App</th>
                                <th className="text-right px-3 py-2 font-normal">Confidence</th>
                                <th className="text-right px-3 py-2 font-normal">Strength</th>
                                <th className="text-right px-3 py-2 font-normal">Last Used</th>
                                <th className="text-center px-3 py-2 font-normal">Status</th>
                                <th className="text-center px-3 py-2 font-normal w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const st = statusBadge(item)
                                return (
                                    <tr
                                        key={item.id}
                                        className="border-b border-[var(--hg-border)] hover:bg-[var(--hg-surface-hover)] transition-colors"
                                    >
                                        <td className="px-3 py-2">
                                            <span
                                                className="px-1.5 py-0.5 text-[10px] font-mono"
                                                style={{
                                                    color: TYPE_COLORS[item.type] ?? 'var(--hg-text-secondary)',
                                                    background: (TYPE_COLORS[item.type] ?? 'var(--hg-text-secondary)') + '18',
                                                }}
                                            >
                                                {HUMAN_TYPE[item.type] ?? item.type}
                                            </span>
                                        </td>
                                        <td
                                            className="px-3 py-2 text-[var(--hg-text-primary)] max-w-[240px] truncate cursor-pointer hover:text-[var(--hg-accent)]"
                                            onClick={() => onItemClick(item.id)}
                                        >
                                            {item.content.slice(0, 80)}{item.content.length > 80 ? '…' : ''}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="px-1.5 py-0.5 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[10px] font-mono text-[var(--hg-text-tertiary)]">
                                                {item.sourceApp ?? 'chorum-core'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <div className="w-12 h-1 bg-[var(--hg-border)] overflow-hidden">
                                                    <div
                                                        className="h-full bg-[var(--hg-accent)]"
                                                        style={{ width: `${item.confidence * 100}%` }}
                                                    />
                                                </div>
                                                <span className="font-mono tabular-nums text-[var(--hg-text-secondary)]">
                                                    {item.confidence.toFixed(2)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--hg-text-secondary)]">
                                            {Math.round(item.decayStrength * 100)}%
                                        </td>
                                        <td className="px-3 py-2 text-right text-[var(--hg-text-tertiary)]">
                                            {timeAgo(item.lastUsedAt)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span
                                                className="px-1.5 py-0.5 text-[10px] font-mono"
                                                style={{ color: st.color, background: st.color + '18' }}
                                            >
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center relative">
                                            <button
                                                className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] transition-colors"
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    setMenuOpen(menuOpen === item.id ? null : item.id)
                                                }}
                                            >
                                                ···
                                            </button>
                                            {menuOpen === item.id && (
                                                <div className="absolute right-3 top-8 z-10 bg-[var(--hg-bg)] border border-[var(--hg-border)] shadow-lg min-w-[120px]">
                                                    <button
                                                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)]"
                                                        onClick={() => handleAction(item.pinnedAt ? 'unpin' : 'pin', item.id)}
                                                    >
                                                        {item.pinnedAt ? 'Unpin' : 'Pin'}
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)]"
                                                        onClick={() => handleAction(item.mutedAt ? 'unmute' : 'mute', item.id)}
                                                    >
                                                        {item.mutedAt ? 'Unmute' : 'Mute'}
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--hg-text-secondary)] hover:bg-[var(--hg-surface-hover)] hover:text-[var(--hg-text-primary)]"
                                                        onClick={() => onItemClick(item.id)}
                                                    >
                                                        View detail
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-3 py-1.5 text-xs text-[var(--hg-destructive)] hover:bg-[var(--hg-destructive-muted)]"
                                                        onClick={() => handleAction('delete', item.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-3">
                    <button
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        className="px-2 py-1 text-xs text-[var(--hg-text-secondary)] border border-[var(--hg-border)] disabled:opacity-30 hover:text-[var(--hg-text-primary)] transition-colors"
                    >
                        ← prev
                    </button>
                    <span className="text-[10px] text-[var(--hg-text-tertiary)] font-mono">
                        {page} / {totalPages}
                    </span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => onPageChange(page + 1)}
                        className="px-2 py-1 text-xs text-[var(--hg-text-secondary)] border border-[var(--hg-border)] disabled:opacity-30 hover:text-[var(--hg-text-primary)] transition-colors"
                    >
                        next →
                    </button>
                </div>
            )}
        </section>
    )
}
