'use client'

import type { ConfidenceStats, LearningItem } from '@/lib/shell/knowledge-actions'
import { timeAgo } from '@/lib/utils/time'

const SEGMENT_COLORS = {
    high: '#34d399',
    medium: '#60a5fa',
    low: '#f87171',
}

export function ConfidenceBar({
    stats,
    onItemClick,
}: {
    stats: ConfidenceStats
    onItemClick: (id: string) => void
}) {
    const total = stats.high + stats.medium + stats.low
    const pctHigh = total > 0 ? (stats.high / total) * 100 : 0
    const pctMed = total > 0 ? (stats.medium / total) * 100 : 0
    const pctLow = total > 0 ? (stats.low / total) * 100 : 0

    return (
        <section className="h-full flex flex-col">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3 flex-shrink-0">
                Confidence Distribution
            </h2>
            <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-4 flex-1 flex flex-col min-h-[300px]">
                {/* Segmented bar */}
                {total === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--hg-text-tertiary)]">
                        <span className="text-2xl mb-2 opacity-30">📊</span>
                        <p className="text-xs">No learnings available</p>
                    </div>
                ) : (
                    <>
                        <div className="w-full h-6 flex overflow-hidden mb-2">
                            {pctHigh > 0 && (
                                <div
                                    className="h-full flex items-center justify-center"
                                    style={{ width: `${pctHigh}%`, background: SEGMENT_COLORS.high }}
                                >
                                    {pctHigh > 10 && (
                                        <span className="text-[10px] text-[var(--hg-bg)] font-mono font-semibold">
                                            {Math.round(pctHigh)}%
                                        </span>
                                    )}
                                </div>
                            )}
                            {pctMed > 0 && (
                                <div
                                    className="h-full flex items-center justify-center"
                                    style={{ width: `${pctMed}%`, background: SEGMENT_COLORS.medium }}
                                >
                                    {pctMed > 10 && (
                                        <span className="text-[10px] text-[var(--hg-bg)] font-mono font-semibold">
                                            {Math.round(pctMed)}%
                                        </span>
                                    )}
                                </div>
                            )}
                            {pctLow > 0 && (
                                <div
                                    className="h-full flex items-center justify-center"
                                    style={{ width: `${pctLow}%`, background: SEGMENT_COLORS.low }}
                                >
                                    {pctLow > 10 && (
                                        <span className="text-[10px] text-[var(--hg-bg)] font-mono font-semibold">
                                            {Math.round(pctLow)}%
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Labels */}
                        <div className="flex justify-between text-xs text-[var(--hg-text-secondary)] mb-6">
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2" style={{ background: SEGMENT_COLORS.high }} />
                                <span>High (&gt;0.8): {stats.high} ({Math.round(pctHigh)}%)</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2" style={{ background: SEGMENT_COLORS.medium }} />
                                <span>Medium (0.5–0.8): {stats.medium} ({Math.round(pctMed)}%)</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2" style={{ background: SEGMENT_COLORS.low }} />
                                <span>Low (&lt;0.5): {stats.low} ({Math.round(pctLow)}%)</span>
                            </div>
                        </div>

                        {/* Top-5 table */}
                        {stats.topItems.length > 0 && (
                            <>
                                <h3 className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">
                                    Top 5 — Highest Confidence
                                </h3>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[var(--hg-text-tertiary)] border-b border-[var(--hg-border)]">
                                            <th className="text-left py-1 font-normal">Title</th>
                                            <th className="text-left py-1 font-normal">App</th>
                                            <th className="text-right py-1 font-normal">Score</th>
                                            <th className="text-right py-1 font-normal">Last used</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.topItems.map(item => (
                                            <tr
                                                key={item.id}
                                                className="border-b border-[var(--hg-border)] cursor-pointer hover:bg-[var(--hg-surface-hover)] transition-colors"
                                                onClick={() => onItemClick(item.id)}
                                            >
                                                <td className="py-1.5 text-[var(--hg-text-primary)] max-w-[200px] truncate">
                                                    {item.content.slice(0, 60)}{item.content.length > 60 ? '…' : ''}
                                                </td>
                                                <td className="py-1.5">
                                                    <span className="px-1.5 py-0.5 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[var(--hg-text-tertiary)] text-[10px] font-mono">
                                                        {item.sourceApp ?? 'chorum-core'}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 text-right font-mono text-[var(--hg-accent)] tabular-nums">
                                                    {item.confidence.toFixed(2)}
                                                </td>
                                                <td className="py-1.5 text-right text-[var(--hg-text-tertiary)]">
                                                    {timeAgo(item.lastUsedAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </>
                )}
            </div>
        </section>
    )
}
