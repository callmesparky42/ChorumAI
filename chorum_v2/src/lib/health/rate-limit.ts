// src/lib/health/rate-limit.ts
// Per-user-per-endpoint sliding window limiter.
// Upstash Redis in production; in-memory fallback for local development.

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number  // unix epoch milliseconds
}

interface WindowConfig {
  requests: number
  windowMs: number
}

const LIMITS: Record<string, WindowConfig> = {
  'snapshots:write': { requests: 60, windowMs: 60_000 },
  'snapshots:read': { requests: 120, windowMs: 60_000 },
  trends: { requests: 30, windowMs: 60_000 },
  'garmin:connect': { requests: 5, windowMs: 300_000 },
  'garmin:sync': { requests: 10, windowMs: 600_000 },
  ocr: { requests: 20, windowMs: 3_600_000 },
  'push:register': { requests: 10, windowMs: 60_000 },
  chat: { requests: 60, windowMs: 60_000 },
  sources: { requests: 60, windowMs: 60_000 },
  default: { requests: 100, windowMs: 60_000 },
}

const memStore = new Map<string, number[]>()

function memRateLimit(key: string, config: WindowConfig): RateLimitResult {
  const now = Date.now()
  const windowStart = now - config.windowMs
  const current = memStore.get(key) ?? []
  const active = current.filter((ts) => ts > windowStart)

  if (active.length >= config.requests) {
    const resetAt = active[0]! + config.windowMs
    memStore.set(key, active)
    return { allowed: false, remaining: 0, resetAt }
  }

  active.push(now)
  memStore.set(key, active)
  return {
    allowed: true,
    remaining: config.requests - active.length,
    resetAt: now + config.windowMs,
  }
}

type UpstashModules = {
  Ratelimit: (typeof import('@upstash/ratelimit'))['Ratelimit']
  Redis: (typeof import('@upstash/redis'))['Redis']
}

let upstashPromise: Promise<UpstashModules> | null = null

async function getUpstash(): Promise<UpstashModules> {
  if (!upstashPromise) {
    upstashPromise = (async () => {
      const ratelimit = await import('@upstash/ratelimit')
      const redis = await import('@upstash/redis')
      return {
        Ratelimit: ratelimit.Ratelimit,
        Redis: redis.Redis,
      }
    })()
  }
  return upstashPromise
}

function windowToSeconds(windowMs: number): `${number} s` {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000))
  return `${seconds} s`
}

async function upstashRateLimit(key: string, config: WindowConfig): Promise<RateLimitResult> {
  const { Ratelimit, Redis } = await getUpstash()
  const redis = Redis.fromEnv()
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, windowToSeconds(config.windowMs)),
    prefix: 'chorum_health',
  })
  const { success, remaining, reset } = await limiter.limit(key)
  return { allowed: success, remaining, resetAt: reset }
}

export async function checkRateLimit(
  userId: string,
  endpoint: keyof typeof LIMITS | string,
): Promise<RateLimitResult> {
  const config = LIMITS[endpoint] ?? LIMITS.default!
  const key = `${userId}:${endpoint}`

  const hasUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN,
  )

  try {
    if (hasUpstash) {
      return await upstashRateLimit(key, config)
    }
    return memRateLimit(key, config)
  } catch {
    return {
      allowed: true,
      remaining: config.requests,
      resetAt: Date.now() + config.windowMs,
    }
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}
