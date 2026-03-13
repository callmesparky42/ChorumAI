'use client'

import type { AppRegistryEntry } from '@/lib/shell/knowledge-actions'
import { timeAgo } from '@/lib/utils/time'

const STATUS_COLORS: Record<string, string> = {
    active: '#22c55e',   // green
    idle: '#eab308',     // yellow
    dormant: '#71717a',  // gray
    error: '#dc2626',    // red
}

function getAppStatus(lastWriteAt: Date | null): 'active' | 'idle' | 'dormant' {
    if (!lastWriteAt) return 'dormant'
    const hoursSince = (Date.now() - new Date(lastWriteAt).getTime()) / 3_600_000
    if (hoursSince < 24) return 'active'
    if (hoursSince < 168) return 'idle'
    return 'dormant'
}


export function AppRegistryCard({
    app,
    isSelected,
    onClick,
}: {
    app: AppRegistryEntry
    isSelected: boolean
    onClick: () => void
}) {
    const status = getAppStatus(app.lastWriteAt)
    const dotColor = STATUS_COLORS[status]

    return (
        <button
            onClick={onClick}
            className="text-left w-full min-w-[220px] p-4 border transition-all"
            style={{
                borderColor: isSelected ? 'var(--hg-accent)' : 'var(--hg-border)',
                background: isSelected ? 'var(--hg-accent-muted)' : 'var(--hg-surface)',
            }}
        >
            <div className="flex items-center gap-2 mb-1">
                <span style={{ color: dotColor, fontSize: 10 }}>●</span>
                <span className="text-xs font-mono text-[var(--hg-text-tertiary)]">{app.slug}</span>
            </div>
            <div className="text-sm font-medium text-[var(--hg-text-primary)] mb-3">{app.displayName}</div>
            <div className="text-xs text-[var(--hg-text-secondary)] mb-1">
                {app.learningCount} learnings
            </div>
            <div className="text-xs text-[var(--hg-text-tertiary)] mb-3">
                Last activity: {timeAgo(app.lastWriteAt)}
            </div>
            {/* Decay health bar */}
            <div className="w-full h-1.5 bg-[var(--hg-border)] overflow-hidden">
                <div
                    className="h-full transition-all duration-500"
                    style={{
                        width: `${app.decayHealthPercent}%`,
                        background: app.decayHealthPercent > 70
                            ? '#22c55e'
                            : app.decayHealthPercent > 40
                                ? '#eab308'
                                : '#f87171',
                    }}
                />
            </div>
            <div className="text-[10px] text-[var(--hg-text-tertiary)] mt-1">
                {app.decayHealthPercent}% healthy
            </div>
        </button>
    )
}
