// src/lib/health/temporal.ts
// Temporal context builder for health LLM calls.
//
// Provides human-readable time framing so the model reasons about data freshness,
// not just data values. All output uses relative offsets (HIPAA Safe Harbor compatible —
// relative times are not date identifiers under 45 CFR §164.514(b)).
//
// Zero external dependencies — uses only built-in Date and Intl.DateTimeFormat.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthTemporalContext {
  now:              Date
  lastGarminSync:   Date | null   // from garmin_sync_state.last_sync_at
  lastConversation: Date | null   // null until health session tracking is added
  dataWindowStart:  Date          // oldest snapshot timestamp in current batch
  dataWindowEnd:    Date          // newest snapshot timestamp in current batch
  snapshotCounts:   Record<string, number>  // type → count
}

// ---------------------------------------------------------------------------
// formatRelativeTime — pure function, no deps, copied from conductor temporal.ts
// ---------------------------------------------------------------------------

export function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1)  return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(diffMs / 86_400_000)
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days} days ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5)   return `${weeks} week${weeks === 1 ? '' : 's'} ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`

  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month:    'long',
    day:      'numeric',
    year:     'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday:  'long',
    month:    'long',
    day:      'numeric',
    year:     'numeric',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
    timeZone: 'UTC',
  }).format(date) + ' UTC'
}

// ---------------------------------------------------------------------------
// buildHealthTemporalBlock — header injected at the top of every health LLM call
// ---------------------------------------------------------------------------

export function buildHealthTemporalBlock(ctx: HealthTemporalContext): string {
  const lines: string[] = ['[HEALTH TEMPORAL CONTEXT]']

  lines.push(`Now:                ${formatDateTime(ctx.now)}`)

  if (ctx.lastGarminSync) {
    lines.push(`Last Garmin sync:   ${formatRelativeTime(ctx.lastGarminSync, ctx.now)}`)
  } else {
    lines.push('Last Garmin sync:   No sync on record')
  }

  if (ctx.lastConversation) {
    lines.push(
      `Last conversation:  ${formatRelativeTime(ctx.lastConversation, ctx.now)} (${formatDate(ctx.lastConversation)})`
    )
  } else {
    lines.push('Last conversation:  First health session')
  }

  const windowStart = formatDate(ctx.dataWindowStart)
  const windowEnd   = formatDate(ctx.dataWindowEnd)
  const windowLabel = windowStart === windowEnd
    ? windowStart
    : `${windowStart} – ${windowEnd}`
  lines.push(`Data window:        ${windowLabel}`)

  const countParts = Object.entries(ctx.snapshotCounts)
    .map(([type, count]) => `${type} x${count}`)
    .join(', ')
  if (countParts) {
    lines.push(`Snapshots in view:  ${countParts}`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// formatSnapshotAge — inline relative timestamp for a single health record
// HIPAA-compatible: relative offsets are not date identifiers under Safe Harbor.
// ---------------------------------------------------------------------------

export function formatSnapshotAge(recordedAt: Date, now: Date): string {
  return formatRelativeTime(recordedAt, now)
}

// ---------------------------------------------------------------------------
// deriveTemporalContext — helper for building HealthTemporalContext from a
// set of snapshot rows. Caller provides lastGarminSync from garmin_sync_state.
// ---------------------------------------------------------------------------

export function deriveTemporalContext(
  rows: Array<{ recordedAt: Date; type: string }>,
  lastGarminSync: Date | null,
  now?: Date,
): HealthTemporalContext {
  const currentTime = now ?? new Date()

  const counts: Record<string, number> = {}
  let earliest = currentTime
  let latest   = new Date(0)

  for (const row of rows) {
    counts[row.type] = (counts[row.type] ?? 0) + 1
    if (row.recordedAt < earliest) earliest = row.recordedAt
    if (row.recordedAt > latest)   latest   = row.recordedAt
  }

  // If no rows, window is now
  if (rows.length === 0) {
    earliest = currentTime
    latest   = currentTime
  }

  return {
    now:              currentTime,
    lastGarminSync,
    lastConversation: null,  // health session tracking not yet implemented
    dataWindowStart:  earliest,
    dataWindowEnd:    latest,
    snapshotCounts:   counts,
  }
}
