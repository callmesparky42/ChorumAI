/**
 * Temporal Awareness — Conductor layer
 *
 * Provides session-level time anchoring and per-item age labels so the LLM
 * always knows: (1) what time it is, (2) how long since the last conversation,
 * (3) how old each injected knowledge item is.
 *
 * Zero external dependencies — uses only built-in Date and Intl.DateTimeFormat.
 */

import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Staleness thresholds by item type (days until a staleness warning is shown)
// null = never stale (stable types: invariant, anchor, antipattern)
// ---------------------------------------------------------------------------

export const DECAY_DEFAULTS_BY_TYPE: Record<string, number | null> = {
    pattern:      90,
    decision:     180,
    golden_path:  90,
    plot_thread:  60,
    character:    null,
    setting:      null,
    voice:        null,
    world_rule:   null,
    invariant:    null,
    anchor:       null,
    antipattern:  null,
}

// Types whose items are always permanent rules — never show an age label
const STABLE_TYPES = new Set(['invariant', 'anchor'])

// ---------------------------------------------------------------------------
// formatRelativeTime — human-readable elapsed time, no external deps
// ---------------------------------------------------------------------------

export function formatRelativeTime(date: Date, now: Date): string {
    const diffMs = now.getTime() - date.getTime()
    if (diffMs < 0) return 'just now'

    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

    const hours = Math.floor(diffMs / 3_600_000)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

    const days = Math.floor(diffMs / 86_400_000)
    if (days === 1) return 'yesterday'
    if (days < 7)  return `${days} days ago`

    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`

    const years = Math.floor(days / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
}

// ---------------------------------------------------------------------------
// Minimal shape needed for staleness checks — satisfied by both
// LearningItem and MemoryCandidate (after adding decaysAfterDays).
// ---------------------------------------------------------------------------

interface AgableItem {
    type: string
    createdAt: Date | null
    lastUsedAt?: Date | null
    pinnedAt?: Date | null
    decaysAfterDays?: number | null
}

// ---------------------------------------------------------------------------
// isStale — true when an item is old AND hasn't been used recently
// ---------------------------------------------------------------------------

export function isStale(item: AgableItem, now: Date): boolean {
    // Pinned items are never stale
    if (item.pinnedAt) return false

    const decayDays = item.decaysAfterDays ?? DECAY_DEFAULTS_BY_TYPE[item.type] ?? null
    if (decayDays === null) return false
    if (!item.createdAt) return false

    const decayMs = decayDays * 86_400_000
    const ageMs   = now.getTime() - item.createdAt.getTime()
    if (ageMs <= decayMs) return false

    // If recently used within the decay window, not stale
    if (item.lastUsedAt) {
        const lastUsedAgeMs = now.getTime() - item.lastUsedAt.getTime()
        if (lastUsedAgeMs <= decayMs) return false
    }

    return true
}

// ---------------------------------------------------------------------------
// formatItemAge — prefix label for assembled context lines
// Returns '' for stable types (invariant, anchor).
// ---------------------------------------------------------------------------

export function formatItemAge(item: AgableItem, now: Date): string {
    if (STABLE_TYPES.has(item.type)) return ''
    if (!item.createdAt) return ''

    const established = formatRelativeTime(item.createdAt, now)

    if (isStale(item, now)) {
        return `[established ${established} — verify still applies] `
    }
    return `[established ${established}] `
}

// ---------------------------------------------------------------------------
// buildTemporalAnchor — session header injected at the top of every context block
// ---------------------------------------------------------------------------

export async function buildTemporalAnchor(projectId: string, now?: Date): Promise<string> {
    const currentTime = now ?? new Date()

    const rows = await db
        .select({ lastConversationAt: projects.lastConversationAt })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

    const lastConvo = rows[0]?.lastConversationAt ?? null

    const nowFormatted = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month:   'long',
        day:     'numeric',
        year:    'numeric',
        hour:    'numeric',
        minute:  '2-digit',
        hour12:  true,
        timeZone: 'UTC',
    }).format(currentTime) + ' UTC'

    const lastConvoStr = lastConvo
        ? `${formatRelativeTime(lastConvo, currentTime)} (${new Intl.DateTimeFormat('en-US', {
              month:    'long',
              day:      'numeric',
              year:     'numeric',
              timeZone: 'UTC',
          }).format(lastConvo)})`
        : 'Never (first session)'

    return `[TEMPORAL CONTEXT]\nNow: ${nowFormatted}\nLast conversation: ${lastConvoStr}`
}

// ---------------------------------------------------------------------------
// touchLastConversation — fire-and-forget update; never throws to caller
// ---------------------------------------------------------------------------

export async function touchLastConversation(projectId: string): Promise<void> {
    await db
        .update(projects)
        .set({ lastConversationAt: new Date() })
        .where(eq(projects.id, projectId))
        .execute()
}
