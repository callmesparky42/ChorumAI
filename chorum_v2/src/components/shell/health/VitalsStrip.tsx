import type { LatestVitalValue, LatestVitals } from '@chorum/health-types'

function daysAgoLabel(recordedAt: string): string {
  const diffMs = Date.now() - new Date(recordedAt).getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'recorded today'
  if (days === 1) return 'recorded 1 day ago'
  return `recorded ${days} days ago`
}

function isStale(recordedAt: string): boolean {
  return (Date.now() - new Date(recordedAt).getTime()) > 24 * 60 * 60 * 1000
}

function formatValue(label: string, value: number): string {
  if (label === 'Steps') return value.toLocaleString()
  return value.toString()
}

function renderCard(
  label: string,
  vital: LatestVitalValue | null,
  unit: string,
  accent: string,
): JSX.Element {
  const stale = vital ? isStale(vital.recordedAt) : false

  return (
    <div
      key={label}
      className="border border-[var(--hg-border)] bg-[var(--hg-surface)] px-3 py-3 min-h-[92px]"
    >
      <p
        className="text-[10px] font-mono uppercase tracking-wider"
        style={{ color: stale ? 'var(--hg-text-tertiary)' : accent }}
      >
        {label}{vital ? ` (${unit})` : ''}
      </p>
      <p className="mt-2 text-base font-medium text-[var(--hg-text-primary)] tabular-nums">
        {vital ? formatValue(label, vital.value) : '—'}
      </p>
      {vital && (
        <p className="mt-1 text-[10px] text-[var(--hg-text-tertiary)]">
          {daysAgoLabel(vital.recordedAt)}
        </p>
      )}
    </div>
  )
}

export function VitalsStrip({ vitals }: { vitals: LatestVitals }) {
  const cards = [
    { label: 'Resting HR', value: vitals.restingHR, unit: 'bpm', accent: 'var(--hg-destructive)' },
    { label: 'Avg HRV', value: vitals.avgHRV, unit: 'ms', accent: 'var(--hg-accent)' },
    { label: 'Steps', value: vitals.steps, unit: 'steps', accent: 'var(--hg-accent-warm)' },
    { label: 'Sleep Score', value: vitals.sleepScore, unit: '/ 100', accent: 'var(--hg-success)' },
  ] as const

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-0 border-t border-l border-[var(--hg-border)]">
      {cards.map((card) => (
        <div key={card.label} className="border-r border-b border-[var(--hg-border)]">
          {renderCard(card.label, card.value, card.unit, card.accent)}
        </div>
      ))}
    </div>
  )
}
