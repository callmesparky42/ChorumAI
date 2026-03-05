'use client'

import { useState, useEffect } from 'react'
import { getInjectionAudit } from '@/lib/shell/actions'

const HUMAN_TYPE_MAP: Record<string, string> = {
    invariant: 'Rule', pattern: 'Pattern', antipattern: 'Thing to avoid',
    decision: 'Decision', golden_path: 'How-to',
    anchor: 'Anchor', character: 'Character',
}

type AuditRow = Awaited<ReturnType<typeof getInjectionAudit>>[number]

export default function AuditPage() {
    const [rows, setRows] = useState<AuditRow[]>([])
    const [loading, setLoading] = useState(true)
    const [showExcluded, setShowExcluded] = useState(false)

    useEffect(() => {
        getInjectionAudit(100).then(data => {
            setRows(data)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    if (loading) return <div className="p-8 text-[var(--hg-text-tertiary)]">Loading audit trail...</div>

    const included = rows.filter(r => r.included)
    const excluded = rows.filter(r => !r.included)
    const displayed = showExcluded ? rows : included

    // Group by conversationId
    const grouped = displayed.reduce<Record<string, AuditRow[]>>((acc, row) => {
        const key = row.conversationId || 'unknown'
        if (!acc[key]) acc[key] = []
        acc[key].push(row)
        return acc
    }, {})

    return (
        <div className="p-4 md:p-8 h-full overflow-y-auto w-full max-w-4xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-xl font-medium">Injection Audit Trail</h1>
                    <p className="text-sm text-[var(--hg-text-secondary)] mt-1">
                        {included.length} injections · {excluded.length} excluded
                    </p>
                </div>
                <button
                    className="text-xs text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] border border-[var(--hg-border)] px-3 py-1.5 transition-colors"
                    onClick={() => setShowExcluded(!showExcluded)}
                >
                    {showExcluded ? 'hide excluded' : 'show excluded'}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="border border-dashed border-[var(--hg-border)] p-16 text-center">
                    <p className="text-[var(--hg-text-secondary)] mb-2">No injection history yet.</p>
                    <p className="text-sm text-[var(--hg-text-tertiary)]">
                        Start chatting in the Chat page. Chorum will log what context it injects for each message.
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {Object.entries(grouped).map(([convId, convRows]) => (
                        <div key={convId} className="border-l border-[var(--hg-border)] pl-6 relative">
                            <div className="absolute top-2 -left-1.5 w-3 h-3 bg-[var(--hg-surface)] border-2 border-[var(--hg-accent)] rounded-full" />

                            <div className="mb-3 text-xs text-[var(--hg-text-tertiary)] font-mono">
                                CONVERSATION · {convId === 'unknown' ? 'no id' : convId.slice(0, 8) + '...'}
                                <span className="ml-4 text-[var(--hg-text-tertiary)]">
                                    {new Date(convRows[0]!.createdAt).toLocaleString()}
                                </span>
                            </div>

                            <div className="space-y-2">
                                {convRows.map(row => (
                                    <div
                                        key={row.id}
                                        className={`bg-[var(--hg-surface)] border px-4 py-3 text-sm ${row.included ? 'border-[var(--hg-border)]' : 'border-[var(--hg-border)] opacity-50'}`}
                                    >
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono uppercase text-[var(--hg-text-tertiary)]">
                                                        {HUMAN_TYPE_MAP[row.learningType || ''] || row.learningType || 'unknown'}
                                                    </span>
                                                    {!row.included && (
                                                        <span className="text-[10px] text-[var(--hg-destructive)] font-mono">EXCLUDED</span>
                                                    )}
                                                    {row.included && (
                                                        <span className="text-[10px] text-[var(--hg-success)] font-mono">TIER {row.tierUsed}</span>
                                                    )}
                                                </div>
                                                <p className="text-[var(--hg-text-primary)] text-xs leading-relaxed">
                                                    {row.learningContent || <span className="text-[var(--hg-text-tertiary)] italic">learning deleted</span>}
                                                </p>
                                                {(row.excludeReason && !row.included) && (
                                                    <p className="text-[10px] text-[var(--hg-text-tertiary)] mt-1 italic">{row.excludeReason}</p>
                                                )}
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="flex items-center gap-2 justify-end">
                                                    <div className="w-14 h-1 bg-[var(--hg-border)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${Math.min(row.score * 100, 100)}%`,
                                                                background: row.included
                                                                    ? 'var(--hg-accent)'
                                                                    : 'var(--hg-text-tertiary)'
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-mono text-[var(--hg-text-tertiary)] w-10 text-right tabular-nums">
                                                        {row.score.toFixed(3)}
                                                    </span>
                                                </div>
                                                {row.tokensUsed && (
                                                    <div className="hg-stat-line justify-end gap-2">
                                                        <span className="hg-label text-[10px]">tokens</span>
                                                        <span className="hg-value text-xs font-mono">{row.tokensUsed}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
