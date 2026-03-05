'use client'

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    AreaChart,
    Area,
    ResponsiveContainer,
    Cell,
} from 'recharts'
import type { NebulaStats } from '@/lib/shell/actions'

const HUMAN_TYPE_MAP: Record<string, string> = {
    invariant: 'Rule',
    pattern: 'Pattern',
    antipattern: 'Thing to avoid',
    decision: 'Decision',
    golden_path: 'How-to',
    anchor: 'Anchor',
    character: 'Character',
    setting: 'Setting',
    plot_thread: 'Plot thread',
    voice: 'Voice',
    world_rule: 'World rule',
}

const BUCKET_COLORS: Record<string, string> = {
    '0–0.2': 'var(--hg-text-tertiary)',
    '0.2–0.4': '#5a6478',
    '0.4–0.6': '#4a7a9b',
    '0.6–0.8': 'var(--hg-accent)',
    '0.8–1.0': 'var(--hg-accent)',
}

function HyggeChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1.5 text-xs text-[var(--hg-text-secondary)]">
            {label && <span className="text-[var(--hg-text-primary)]">{label}: </span>}
            <span>{payload[0].value}</span>
        </div>
    )
}

export interface NebulaChartsProps {
    stats: NebulaStats
}

export function NebulaCharts({ stats }: NebulaChartsProps) {
    const typeData = Object.entries(stats.byType).map(([type, count]) => ({
        name: HUMAN_TYPE_MAP[type] ?? type,
        count,
    })).sort((a, b) => b.count - a.count)

    const last7 = stats.injectionsByDay.slice(-7)
    const weekTotal = last7.reduce((sum, d) => sum + d.count, 0)
    const injectionSummary = weekTotal > 0
        ? `~${(weekTotal / 7).toFixed(1)} injections/day this week`
        : 'no injections yet'

    const typeChartHeight = Math.max(100, typeData.length * 28)
    const hasInjectionData = stats.injectionsByDay.some(d => d.count > 0)

    return (
        <section className="mb-10">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
                Nebula Health
            </h2>

            <div className="flex gap-4 text-sm text-[var(--hg-text-secondary)] mb-6">
                <span>{stats.totalLearnings} total</span>
                <span className="text-[var(--hg-text-tertiary)]">·</span>
                <span>{stats.topScopes.length} scopes</span>
                <span className="text-[var(--hg-text-tertiary)]">·</span>
                <span>{injectionSummary}</span>
            </div>

            {stats.totalLearnings === 0 ? (
                <p className="text-sm text-[var(--hg-text-tertiary)]">
                    No learnings yet — start chatting to populate the Nebula.
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Chart 1: Type Breakdown */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">Types</p>
                        <ResponsiveContainer width="100%" height={typeChartHeight}>
                            <BarChart
                                data={typeData}
                                layout="vertical"
                                margin={{ top: 0, right: 24, bottom: 0, left: 60 }}
                            >
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: 'var(--hg-text-secondary)' }}
                                    width={56}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <XAxis
                                    type="number"
                                    hide={true}
                                    axisLine={false}
                                />
                                <Tooltip
                                    content={<HyggeChartTooltip />}
                                    cursor={{ fill: 'var(--hg-surface-hover)' }}
                                />
                                <Bar dataKey="count" fill="var(--hg-accent)" radius={[0, 2, 2, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Chart 2: Confidence Distribution */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">Confidence</p>
                        <ResponsiveContainer width="100%" height={120}>
                            <BarChart
                                data={stats.confidenceDistribution}
                                margin={{ top: 4, right: 4, bottom: 20, left: 0 }}
                            >
                                <XAxis
                                    dataKey="bucket"
                                    tick={{ fontSize: 9, fill: 'var(--hg-text-tertiary)' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis hide={true} />
                                <Tooltip
                                    content={<HyggeChartTooltip />}
                                    cursor={{ fill: 'var(--hg-surface-hover)' }}
                                />
                                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                    {stats.confidenceDistribution.map((entry, i) => (
                                        <Cell
                                            key={i}
                                            fill={BUCKET_COLORS[entry.bucket] ?? 'var(--hg-accent)'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Chart 3: Injection Sparkline */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-2">
                            Injections — last 14 days
                        </p>
                        {hasInjectionData ? (
                            <ResponsiveContainer width="100%" height={72}>
                                <AreaChart
                                    data={stats.injectionsByDay}
                                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                                >
                                    <XAxis dataKey="date" hide={true} />
                                    <YAxis hide={true} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0]?.payload
                                            return (
                                                <div className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-secondary)]">
                                                    {d?.date}: {d?.count} injections
                                                </div>
                                            )
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        fill="var(--hg-accent-muted)"
                                        stroke="var(--hg-accent)"
                                        strokeWidth={1.5}
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-6">
                                No injections yet — start chatting
                            </p>
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}
