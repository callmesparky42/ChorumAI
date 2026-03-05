// src/lib/core/podium/cache.ts
// In-memory pre-compiled context cache.
// Phase 2 implementation is single-node memory.

import type { Tier } from './tiers'
import type { InjectedLearning } from '../interface'

export interface CachedContext {
    items: InjectedLearning[]
    compiledContext: string
    tierUsed: Tier
    tokensUsed: number
    cachedAt: number
}

// TTL configuration by tier (Tier 3 is not cached)
const CACHE_TTL_MS: Record<Tier, number> = {
    1: 5 * 60 * 1000,   // 5 minutes
    2: 15 * 60 * 1000,  // 15 minutes
    3: 0,               // Disabled
}

// In-memory store (Map)
const store = new Map<string, CachedContext>()

function makeCacheKey(userId: string, scopeInclude: string[], domain: string | null, tier: Tier): string {
    // Sorting scopes ensures array order doesn't break cache hits
    const sortedScopes = [...scopeInclude].sort().join(',')
    return `${userId}::${sortedScopes}::${domain ?? 'null'}::${tier}`
}

export function getCached(
    userId: string,
    scopeInclude: string[],
    domain: string | null,
    tier: Tier,
): CachedContext | null {
    if (tier === 3) return null

    const key = makeCacheKey(userId, scopeInclude, domain, tier)
    const entry = store.get(key)
    if (!entry) return null

    const ttl = CACHE_TTL_MS[entry.tierUsed]
    if (Date.now() - entry.cachedAt > ttl) {
        store.delete(key)
        return null
    }
    return entry
}

export function setCached(
    userId: string,
    scopeInclude: string[],
    domain: string | null,
    tier: Tier,
    entry: CachedContext,
): void {
    if (tier === 3) return
    const key = makeCacheKey(userId, scopeInclude, domain, tier)
    store.set(key, entry)
}

/**
 * Invalidate all cache entries for a user.
 * Phase 2: Iterate and delete. Phase 3: Redis key patterns.
 */
export function invalidateUser(userId: string): void {
    const prefix = `${userId}::`
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key)
        }
    }
}
