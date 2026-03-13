import Link from 'next/link'
import type { SnapshotSummary } from '@chorum/health-types'
import { TiffViewer } from './TiffViewer'

const badgeStyles: Record<string, { background: string; color: string }> = {
  garmin_daily: { background: 'var(--hg-accent-muted)', color: 'var(--hg-accent)' },
  garmin_hrv: { background: 'var(--hg-accent-muted)', color: 'var(--hg-accent)' },
  labs: { background: 'rgba(168,85,247,0.12)', color: '#c084fc' },
  icd_report: { background: 'rgba(247,195,37,0.12)', color: 'var(--hg-accent-warm)' },
  vitals: { background: 'rgba(34,197,94,0.12)', color: 'var(--hg-success)' },
  mychart: { background: 'var(--hg-surface)', color: 'var(--hg-text-secondary)' },
  ocr_document: { background: 'var(--hg-surface)', color: 'var(--hg-text-secondary)' },
  checkup_result: { background: 'rgba(41,171,226,0.12)', color: 'var(--hg-accent)' },
}

function prettySource(source: string): string {
  return source.replace('_', ' ')
}

export function SnapshotTimeline({
  snapshots,
  total,
  currentPage = 1,
}: {
  snapshots: SnapshotSummary[]
  total: number
  currentPage?: number
}) {
  if (snapshots.length === 0) {
    return (
      <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-4">
        <p className="text-sm text-[var(--hg-text-primary)]">No health data yet.</p>
        <p className="text-xs text-[var(--hg-text-tertiary)] mt-1">
          Upload a file or connect Garmin to get started.
        </p>
      </div>
    )
  }

  const hasMore = currentPage * 20 < total

  return (
    <div className="space-y-3">
      {snapshots.map((snapshot) => {
        const badge = badgeStyles[snapshot.type] ?? {
          background: 'var(--hg-surface)',
          color: 'var(--hg-text-secondary)',
        }

        return (
          <article key={snapshot.id} className="border border-[var(--hg-border)] bg-[var(--hg-surface)] p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="px-2 py-0.5 font-mono uppercase tracking-wider"
                style={{ background: badge.background, color: badge.color }}
              >
                {snapshot.type}
              </span>
              <span className="text-[var(--hg-text-secondary)]">
                {new Date(snapshot.recordedAt).toLocaleDateString()} · {prettySource(snapshot.source)}
              </span>
            </div>

            <p className="mt-2 text-sm text-[var(--hg-text-primary)]">
              {snapshot.summary}
              {snapshot.flagCount > 0 && (
                <span className="ml-2 text-[var(--hg-destructive)] text-xs">
                  {snapshot.flagCount} flagged
                </span>
              )}
            </p>

            {snapshot.tiffPageUrls && snapshot.tiffPageUrls.length > 0 && (
              <TiffViewer pages={snapshot.tiffPageUrls} />
            )}
          </article>
        )
      })}

      {hasMore && (
        <div className="pt-2">
          <Link href={`?page=${currentPage + 1}`} className="hg-btn text-xs">
            Load more
          </Link>
        </div>
      )}
    </div>
  )
}
