'use client'

import { useState } from 'react'
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DecayTimePoint } from '@/lib/shell/knowledge-actions'

const BRACKET_COLORS = {
    pinned: '#a78bfa',
    fresh: '#34d399',
    active: '#60a5fa',
    fading: '#fbbf24',
    dormant: '#f87171',
}

function DecayTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-2 text-xs">
            <div className="text-[var(--hg-text-primary)] font-mono mb-1">{label}</div>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.dataKey}</span>
                    <span className="text-[var(--hg-text-secondary)] tabular-nums">{p.value}</span>
                </div>
            ))}
        </div>
    )
}

export function DecayMap({
    data,
    onDaysChange,
    currentDays,
    onDateClick,
}: {
    data: DecayTimePoint[]
    onDaysChange: (days: 14 | 30 | 90) => void
    currentDays: 14 | 30 | 90
    onDateClick?: (date: string) => void
}) {
    const dayOptions: (14 | 30 | 90)[] = [14, 30, 90]

    return (
        <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)]">
                    Decay Map
                </h2>
                <div className="flex gap-1">
                    {dayOptions.map(d => (
                        <button
                            key={d}
                            onClick={() => onDaysChange(d)}
                            className="px-2 py-0.5 text-[10px] font-mono transition-colors"
                            style={{
                                color: currentDays === d ? 'var(--hg-accent)' : 'var(--hg-text-tertiary)',
                                borderBottom: currentDays === d ? '1px solid var(--hg-accent)' : '1px solid transparent',
                            }}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-4">
                {data.length === 0 ? (
                    <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-8">
                        No decay data available
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart
                            data={data}
                            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                            onClick={(e: any) => {
                                if (e?.activeLabel && onDateClick) onDateClick(e.activeLabel)
                            }}
                        >
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 9, fill: 'var(--hg-text-tertiary)' }}
                                axisLine={false}
                                tickLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis hide />
                            <Tooltip content={<DecayTooltip />} />
                            <Area type="monotone" dataKey="pinned" stackId="1" fill={BRACKET_COLORS.pinned} stroke={BRACKET_COLORS.pinned} fillOpacity={0.8} />
                            <Area type="monotone" dataKey="fresh" stackId="1" fill={BRACKET_COLORS.fresh} stroke={BRACKET_COLORS.fresh} fillOpacity={0.8} />
                            <Area type="monotone" dataKey="active" stackId="1" fill={BRACKET_COLORS.active} stroke={BRACKET_COLORS.active} fillOpacity={0.8} />
                            <Area type="monotone" dataKey="fading" stackId="1" fill={BRACKET_COLORS.fading} stroke={BRACKET_COLORS.fading} fillOpacity={0.8} />
                            <Area type="monotone" dataKey="dormant" stackId="1" fill={BRACKET_COLORS.dormant} stroke={BRACKET_COLORS.dormant} fillOpacity={0.8} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-2">
                {Object.entries(BRACKET_COLORS).map(([key, color]) => (
                    <div key={key} className="flex items-center gap-1">
                        <div className="w-2 h-2" style={{ background: color }} />
                        <span className="text-[10px] text-[var(--hg-text-tertiary)] capitalize">{key}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}
