'use client'

import {
  AreaChart, Area,
  ScatterChart, Scatter,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import type { ReactNode } from 'react'

import type { HRChartPoint, HRVChartPoint, SleepChartPoint, StepsChartPoint } from '@chorum/health-types'

function Section({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
        {label}
      </p>
      {children}
    </section>
  )
}

export function HealthCharts({
  hrChart,
  hrvChart,
  sleepChart,
  stepsChart,
}: {
  hrChart: HRChartPoint[]
  hrvChart: HRVChartPoint[]
  sleepChart: SleepChartPoint[]
  stepsChart: StepsChartPoint[]
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Section label="Heart Rate">
        {hrChart.length === 0 ? (
          <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No heart rate data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hrChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="restingHR"
                stroke="var(--hg-destructive)"
                fill="rgba(220,38,38,0.08)"
                strokeWidth={1.5}
                name="Resting HR"
              />
              <Area
                type="monotone"
                dataKey="avgHR"
                stroke="var(--hg-accent)"
                fill="rgba(41,171,226,0.06)"
                strokeWidth={1}
                name="Avg HR"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section label="HRV">
        {hrvChart.length === 0 ? (
          <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No HRV data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ScatterChart margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
              <XAxis
                dataKey="date"
                name="Date"
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis dataKey="avgHRV" name="HRV (ms)" tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }}
              />
              <Scatter data={hrvChart} fill="var(--hg-accent)" opacity={0.7} />
              <ReferenceLine
                y={hrvChart.reduce((sum, point) => sum + point.avgHRV, 0) / hrvChart.length}
                stroke="var(--hg-accent-warm)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'avg', fill: 'var(--hg-text-tertiary)', fontSize: 10 }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section label="Sleep">
        {sleepChart.length === 0 ? (
          <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No sleep data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sleepChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(value) => `${Math.round(Number(value) / 60)}h`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number | undefined, name: string | undefined) => value != null ? [`${Math.round(value / 60)}h ${value % 60}m`, name ?? ''] : [name ?? '']) as any}
              />
              <Bar dataKey="deepMinutes" stackId="sleep" fill="var(--hg-accent)" name="Deep" />
              <Bar dataKey="remMinutes" stackId="sleep" fill="var(--hg-accent-warm)" name="REM" />
              <Bar dataKey="lightMinutes" stackId="sleep" fill="var(--hg-border-subtle)" name="Light" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>

      <Section label="Steps">
        {stepsChart.length === 0 ? (
          <p className="text-xs text-[var(--hg-text-tertiary)] text-center py-12">No steps data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stepsChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hg-border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(d) => String(d).slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--hg-text-tertiary)' }}
                tickFormatter={(value) => Number(value) >= 1000 ? `${(Number(value) / 1000).toFixed(0)}k` : String(value)}
              />
              <Tooltip
                contentStyle={{ background: 'var(--hg-surface)', border: '1px solid var(--hg-border)', fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: number | undefined) => value != null ? [value.toLocaleString(), 'Steps'] : ['Steps']) as any}
              />
              <Bar dataKey="steps" fill="var(--hg-accent-warm)" opacity={0.8} />
              <ReferenceLine
                y={10000}
                stroke="var(--hg-accent)"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: '10k goal', fill: 'var(--hg-text-tertiary)', fontSize: 10 }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Section>
    </div>
  )
}
