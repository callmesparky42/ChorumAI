// src/lib/shell/rate-limit.ts
// In-memory fixed-window rate limiter for server actions.
// Each user gets `MAX_REQUESTS` per `WINDOW_MS`.
// Resets naturally as the window rolls. No external dependency.

const WINDOW_MS = 60_000           // 1 minute
const MAX_REQUESTS = 60            // max actions per window per user

interface WindowEntry {
    count: number
    resetAt: number
}

const windows = new Map<string, WindowEntry>()

// Prune stale entries every 5 minutes to prevent unbounded growth
let lastPrune = Date.now()
function prune() {
    const now = Date.now()
    if (now - lastPrune < 300_000) return
    lastPrune = now
    for (const [key, entry] of windows) {
        if (entry.resetAt < now) windows.delete(key)
    }
}

/**
 * Check rate limit for a user. Throws if exceeded.
 * Call this at the top of any server action after auth.
 */
export function checkRateLimit(userId: string): void {
    prune()
    const now = Date.now()
    let entry = windows.get(userId)

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + WINDOW_MS }
        windows.set(userId, entry)
    }

    entry.count++
    if (entry.count > MAX_REQUESTS) {
        throw new Error('Rate limit exceeded. Please try again shortly.')
    }
}
