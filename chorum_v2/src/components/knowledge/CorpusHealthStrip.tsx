'use client'

import type { CorpusHealthStats } from '@/lib/shell/knowledge-actions'

const TILES = [
    { key: 'total', label: 'Total Learnings', sub: 'across all projects' },
    { key: 'active', label: 'Active', sub: '> 20% strength' },
    { key: 'pinned', label: 'Pinned', sub: 'always injected' },
    { key: 'muted', label: 'Muted', sub: 'never injected' },
    { key: 'avgConfidence', label: 'Avg Confidence', sub: 'corpus mean' },
] as const

export function CorpusHealthStrip({ stats }: { stats: CorpusHealthStats }) {
    const values: Record<string, string> = {
        total: stats.total.toLocaleString(),
        active: stats.active.toLocaleString(),
        pinned: stats.pinned.toLocaleString(),
        muted: stats.muted.toLocaleString(),
        avgConfidence: stats.avgConfidence.toFixed(2),
    }

    return (
        <section className="h-full flex flex-col">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3 flex-shrink-0">
                Corpus Health
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                {TILES.map(t => (
                    <div
                        key={t.key}
                        className="p-4 border border-[var(--hg-border)] bg-[var(--hg-surface)] flex flex-col justify-center transition-colors hover:border-[var(--hg-border-subtle)]"
                    >
                        <div className="text-2xl font-light text-[var(--hg-text-primary)] tabular-nums tracking-tight">
                            {values[t.key]}
                        </div>
                        <div className="text-xs font-medium text-[var(--hg-text-secondary)] mt-2">{t.label}</div>
                        <div className="text-[10px] text-[var(--hg-text-tertiary)] mt-1">{t.sub}</div>
                    </div>
                ))}
            </div>
        </section>
    )
}
