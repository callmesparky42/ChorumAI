'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import {
    getLearningDetail,
    pinLearning, unpinLearning, muteLearning, unmuteLearning, deleteLearning,
} from '@/lib/shell/knowledge-actions'
import type { LearningDetail } from '@/lib/shell/knowledge-actions'
import { timeAgo } from '@/lib/utils/time'

const TYPE_LABELS: Record<string, string> = {
    invariant: 'Rule', pattern: 'Pattern', antipattern: 'Avoid',
    golden_path: 'How-to', decision: 'Decision', anchor: 'Anchor',
    character: 'Character', setting: 'Setting', plot_thread: 'Plot thread',
    voice: 'Voice', world_rule: 'World rule',
}

const TYPE_COLORS: Record<string, string> = {
    invariant: '#60a5fa', pattern: '#34d399', antipattern: '#f87171',
    golden_path: '#fbbf24', decision: '#a78bfa',
}


export function LearningDetailDrawer({
    learningId,
    onClose,
    onRefresh,
}: {
    learningId: string | null
    onClose: () => void
    onRefresh: () => void
}) {
    const [detail, setDetail] = useState<LearningDetail | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!learningId) { setDetail(null); return }
        setLoading(true)
        getLearningDetail(learningId)
            .then(setDetail)
            .catch(() => setDetail(null))
            .finally(() => setLoading(false))
    }, [learningId])

    if (!learningId) return null

    // Simulated decay curve: compute strength at day offsets for the past 30 days
    const decayCurve = detail ? Array.from({ length: 30 }, (_, i) => {
        const daysAgo = 29 - i
        const refDate = detail.lastUsedAt ?? detail.createdAt
        const refMs = new Date(refDate).getTime()
        const pointMs = Date.now() - daysAgo * 86_400_000
        const daysSinceRef = Math.max(0, (pointMs - refMs) / 86_400_000)
        const strength = detail.pinnedAt
            ? 1.0
            : Math.min(1, (detail.usageCount * 0.1) + Math.max(0, 1 - daysSinceRef / 90))
        return { day: `${daysAgo}d ago`, strength: Math.round(strength * 100) }
    }) : []

    const handleAction = async (action: string) => {
        if (!detail) return
        try {
            switch (action) {
                case 'pin': await pinLearning(detail.id); break
                case 'unpin': await unpinLearning(detail.id); break
                case 'mute': await muteLearning(detail.id); break
                case 'unmute': await unmuteLearning(detail.id); break
                case 'delete':
                    if (confirm('Delete this learning? This cannot be undone.')) {
                        await deleteLearning(detail.id)
                        onClose()
                    }
                    break
            }
            onRefresh()
            // Re-fetch detail
            if (action !== 'delete') {
                const updated = await getLearningDetail(detail.id)
                setDetail(updated)
            }
        } catch { /* silent */ }
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[var(--hg-bg)] border-l border-[var(--hg-border)] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--hg-border)] px-4 py-3 sticky top-0 bg-[var(--hg-bg)]">
                    <h3 className="text-sm font-medium text-[var(--hg-text-primary)]">Learning Detail</h3>
                    <button
                        onClick={onClose}
                        className="text-xs text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] transition-colors"
                    >
                        close ×
                    </button>
                </div>

                <div className="p-4">
                    {loading ? (
                        <div className="space-y-3">
                            <div className="h-4 w-20 bg-[var(--hg-surface)] animate-pulse" />
                            <div className="h-16 bg-[var(--hg-surface)] animate-pulse" />
                            <div className="h-4 w-32 bg-[var(--hg-surface)] animate-pulse" />
                        </div>
                    ) : detail ? (
                        <div className="space-y-5">
                            {/* Type badge + Source app */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span
                                    className="px-2 py-0.5 text-xs font-mono"
                                    style={{
                                        color: TYPE_COLORS[detail.type] ?? 'var(--hg-text-secondary)',
                                        background: (TYPE_COLORS[detail.type] ?? 'var(--hg-text-secondary)') + '18',
                                    }}
                                >
                                    {TYPE_LABELS[detail.type] ?? detail.type}
                                </span>
                                <span className="px-2 py-0.5 text-[10px] font-mono bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[var(--hg-text-tertiary)]">
                                    {detail.sourceApp ?? 'chorum-core'}
                                </span>
                            </div>

                            {/* Content */}
                            <p className="text-sm text-[var(--hg-text-primary)] leading-relaxed">
                                {detail.content}
                            </p>

                            {/* Scopes */}
                            {detail.scopes.length > 0 && (
                                <div className="flex gap-1 flex-wrap">
                                    {detail.scopes.map(s => (
                                        <span
                                            key={s}
                                            className="text-[10px] px-1.5 py-0.5 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[var(--hg-text-tertiary)]"
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Confidence bar */}
                            <div>
                                <div className="flex justify-between text-xs text-[var(--hg-text-secondary)] mb-1">
                                    <span>Confidence</span>
                                    <span className="font-mono tabular-nums">{detail.confidence.toFixed(2)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--hg-border)]">
                                    <div
                                        className="h-full bg-[var(--hg-accent)] transition-all"
                                        style={{ width: `${detail.confidence * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Decay Curve */}
                            <div>
                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">
                                    Decay Curve — 30 days
                                </h4>
                                <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-2">
                                    <ResponsiveContainer width="100%" height={80}>
                                        <AreaChart data={decayCurve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                            <XAxis dataKey="day" hide />
                                            <YAxis hide domain={[0, 100]} />
                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null
                                                    const d = payload[0]?.payload
                                                    return (
                                                        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-secondary)]">
                                                            {d?.day}: {d?.strength}%
                                                        </div>
                                                    )
                                                }}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="strength"
                                                fill="var(--hg-accent-muted)"
                                                stroke="var(--hg-accent)"
                                                strokeWidth={1.5}
                                                dot={false}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="hg-stat-line">
                                    <span className="hg-label">Usage count</span>
                                    <span className="hg-fill" />
                                    <span className="hg-value">{detail.usageCount}</span>
                                </div>
                                <div className="hg-stat-line">
                                    <span className="hg-label">Strength</span>
                                    <span className="hg-fill" />
                                    <span className="hg-value">{Math.round(detail.decayStrength * 100)}%</span>
                                </div>
                                <div className="hg-stat-line">
                                    <span className="hg-label">Last used</span>
                                    <span className="hg-fill" />
                                    <span className="hg-value">{timeAgo(detail.lastUsedAt)}</span>
                                </div>
                                <div className="hg-stat-line">
                                    <span className="hg-label">Created</span>
                                    <span className="hg-fill" />
                                    <span className="hg-value">{timeAgo(detail.createdAt)}</span>
                                </div>
                            </div>

                            {/* Injection History */}
                            <div>
                                <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">
                                    Injection History
                                </h4>
                                {detail.injectionHistory.length === 0 ? (
                                    <p className="text-xs text-[var(--hg-text-tertiary)]">No injections recorded</p>
                                ) : (
                                    <div className="space-y-1">
                                        {detail.injectionHistory.map((inj, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-2 text-xs border-b border-[var(--hg-border)] py-1"
                                            >
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full"
                                                    style={{ background: inj.included ? '#34d399' : '#f87171' }}
                                                />
                                                <span className="text-[var(--hg-text-secondary)]">
                                                    Tier {inj.tierUsed}
                                                </span>
                                                <span className="text-[var(--hg-text-tertiary)] font-mono tabular-nums">
                                                    {inj.score.toFixed(2)}
                                                </span>
                                                <span className="text-[var(--hg-text-tertiary)] ml-auto text-[10px]">
                                                    {timeAgo(inj.createdAt)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-2 border-t border-[var(--hg-border)]">
                                <button
                                    className="hg-btn hg-btn-accent text-xs flex-1"
                                    onClick={() => handleAction(detail.pinnedAt ? 'unpin' : 'pin')}
                                >
                                    {detail.pinnedAt ? 'Unpin' : 'Pin'}
                                </button>
                                <button
                                    className="hg-btn hg-btn-outline text-xs flex-1"
                                    onClick={() => handleAction(detail.mutedAt ? 'unmute' : 'mute')}
                                >
                                    {detail.mutedAt ? 'Unmute' : 'Mute'}
                                </button>
                                <button
                                    className="hg-btn hg-btn-destructive text-xs flex-1"
                                    onClick={() => handleAction('delete')}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-[var(--hg-text-tertiary)]">Learning not found</p>
                    )}
                </div>
            </div>
        </>
    )
}
