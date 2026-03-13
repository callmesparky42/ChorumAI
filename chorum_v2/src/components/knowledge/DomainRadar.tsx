'use client'

import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip,
} from 'recharts'
import type { DomainPoint } from '@/lib/shell/knowledge-actions'

function DomainTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-xs">
            <div className="text-[var(--hg-text-primary)] font-medium">{d?.domain}</div>
            <div className="text-[var(--hg-text-secondary)] tabular-nums">
                Weighted: {d?.weightedCount}
                {d?.fullCorpus !== undefined && (
                    <span className="text-[var(--hg-text-tertiary)]"> / {d.fullCorpus} corpus</span>
                )}
            </div>
        </div>
    )
}

export function DomainRadar({
    data,
    hasAppFilter,
}: {
    data: DomainPoint[]
    hasAppFilter: boolean
}) {
    return (
        <section className="h-full flex flex-col">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3 flex-shrink-0">
                Domain Radar
            </h2>
            <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-4 flex-1 flex flex-col justify-center min-h-[300px]">
                {data.every(d => d.weightedCount === 0) ? (
                    <div className="flex flex-col items-center justify-center text-[var(--hg-text-tertiary)]">
                        <span className="text-2xl mb-2 opacity-30">⨀</span>
                        <p className="text-xs text-center">No domain data yet</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
                            <PolarGrid stroke="var(--hg-border)" />
                            <PolarAngleAxis
                                dataKey="domain"
                                tick={{ fontSize: 9, fill: 'var(--hg-text-tertiary)' }}
                            />
                            <PolarRadiusAxis tick={false} axisLine={false} />
                            <Tooltip content={<DomainTooltip />} />
                            {hasAppFilter && (
                                <Radar
                                    name="Corpus"
                                    dataKey="fullCorpus"
                                    stroke="var(--hg-text-tertiary)"
                                    fill="transparent"
                                    strokeDasharray="4 4"
                                    strokeWidth={1}
                                />
                            )}
                            <Radar
                                name="Selected"
                                dataKey="weightedCount"
                                stroke="var(--hg-accent)"
                                fill="var(--hg-accent)"
                                fillOpacity={0.2}
                                strokeWidth={1.5}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </section>
    )
}
