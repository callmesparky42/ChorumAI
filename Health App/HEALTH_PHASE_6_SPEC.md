# Health Phase 6 Specification: HIPAA Hardening, Rate Limiting, Biometrics, Key Rotation

**Version:** 1.0
**Date:** 2026-03-06
**Status:** Ready for execution
**Prerequisite:** Health Phases 1–5 complete and deployed to production.
**Guardian gates:** None inherited — health layer is isolated from Chorum core. This phase introduces no schema-breaking changes.

---

## Agent Instructions

You are executing **Health Phase 6** — the security and compliance hardening layer of Chorum Health. Your job is to take a working system and make it production-hardened: PHI integrity verification, rate limiting on all health endpoints, biometric re-auth on mobile for sensitive flows, automatic stale token cleanup, streaming chat on mobile, key rotation tooling, and a complete HIPAA technical safeguards checklist. When Phase 6 is done, the system satisfies HIPAA Security Rule §164.312 technical safeguards end-to-end and is ready for a security review.

Read this document completely before writing a single file. Every decision is locked. If something is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. `src/lib/health/rate-limit.ts` — health-specific rate limiter (sliding window, per-user-per-endpoint)
2. Apply rate limiting to all 10 health API routes — add `checkRateLimit` calls in-route (not middleware)
3. `src/lib/health/integrity.ts` — PHI integrity verifier: re-derives hash from decrypted payload, compares to stored `payload_hash`
4. `src/app/api/cron/health-integrity-check/route.ts` — weekly cron: samples 20% of snapshots, writes `integrity_failure` audit entries for any mismatches
5. `src/app/api/health/admin/retention/route.ts` — GET/PATCH retention policy using `health_user_settings`; DELETE to purge all snapshots
6. `src/app/api/health/admin/alerts/route.ts` — GET/PATCH user's alert threshold config (stored as JSON in `health_user_settings.alertThresholds`)
7. `src/app/api/cron/health-data-retention/route.ts` — monthly cron: enforces retention policy per user, writes deletion audit entries
8. `src/app/api/health/push/receipts/route.ts` — Expo push receipt checker: marks `active = false` for `DeviceNotRegistered` tokens
9. `src/app/api/cron/health-push-receipts/route.ts` — daily cron: checks push receipts, cleans up dead tokens
10. `apps/health-mobile/lib/biometric.ts` — biometric re-auth wrapper (requires prompt → face/fingerprint → resolved Promise)
11. `apps/health-mobile/components/BiometricGate.tsx` — wraps any sensitive action with a re-auth challenge
12. Update `apps/health-mobile/app/(tabs)/upload.tsx` — wrap OCR trigger in `BiometricGate`
13. Update `apps/health-mobile/app/(tabs)/chat.tsx` — replace non-streaming chat with SSE streaming (point at `/api/health/chat/stream`)
14. `src/scripts/rotate-health-key.ts` — key rotation script: re-encrypts all snapshots under a new key
15. `vercel.json` — add integrity check, retention, and push receipts crons

**Note — already implemented (do not re-create):**
- `src/lib/health/alert-evaluator.ts` — evaluates `AlertThresholds` against synced data; called from `garmin-sync.ts` after each user sync; fires push notify on threshold breach
- `src/app/api/health/chat/route.ts` — non-streaming health chat (Phase 5 used this; Phase 6 upgrades mobile to the SSE stream endpoint)
- `src/app/api/health/export/summary/route.ts` — pre-visit appointment summary endpoint
- `src/app/api/health/trends/labs/route.ts` — lab marker trend endpoint
- `drizzle/0014_health_user_settings.sql` — `health_user_settings` table (retention + alertThresholds)

**What you will NOT produce:**
- Doctor portal or data sharing API — not in scope
- Scanned image-only PDF rendering — not in scope (requires native canvas binary incompatible with Vercel; text-based PDFs already handled in Phase 5 via `pdf.ts`)
- Automated penetration testing — human action
- Any changes to Chorum core DB schema or Layer 0–5 code
- Any `any` types — use `unknown` + type guards throughout

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Security requirements, HIPAA §164.312 mapping |
| Phase 1 Spec | `Health App/HEALTH_PHASE_1_SPEC.md` | Schema, `crypto.ts`, `audit.ts`, push_tokens table |
| Phase 5 Spec | `Health App/HEALTH_PHASE_5_SPEC.md` | Push notify endpoint, OCR upload flow, chat tab |
| Crypto layer | `chorum_v2/src/lib/health/crypto.ts` | `encryptPHI`, `decryptPHI`, `hashPHI` — do not modify |
| Audit layer | `chorum_v2/src/lib/health/audit.ts` | `logPhiAccess` — new action type `'integrity_failure'` used here |
| Health schema | `chorum_v2/src/db/health-schema.ts` | All tables; add `userRetentionDays` column via migration |

---

## Step 0: Human Prerequisites (Not Agent Work)

> [!IMPORTANT]
> Complete before the agent proceeds.

### 0.1 — Upstash Redis for Rate Limiting (production)

Rate limiting uses Upstash Redis in production (serverless-compatible sliding window). For local dev, the rate limiter falls back to an in-memory Map.

1. Create an Upstash Redis database at upstash.com (free tier is sufficient)
2. Note **REST URL** and **REST Token**

Add to Vercel environment variables:

| Variable | Value | Environments |
|----------|-------|--------------|
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL | Production, Preview |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | Production, Preview |

**`.env.local`**:
```
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

### 0.2 — Install Dependencies

```bash
# In chorum_v2/:
npm install @upstash/ratelimit @upstash/redis

# In apps/health-mobile/:
npx expo install expo-local-authentication
```

`expo-local-authentication` is already listed in Phase 4's `package.json` (it was included for the login screen biometric option). No new install needed if Phase 4 is already built.

### 0.3 — Add Environment Variables for New Crons

| Variable | Value | Environments |
|----------|-------|--------------|
| `HEALTH_INTEGRITY_SECRET` | `openssl rand -hex 32` | Production, Preview |
| `HEALTH_RETENTION_SECRET` | `openssl rand -hex 32` | Production, Preview |
| `HEALTH_RECEIPTS_SECRET` | `openssl rand -hex 32` | Production, Preview |

Add all three to `.env.local` as well.

### 0.4 — Schema Migration: `user_retention_days` Column

Run this migration against `HEALTH_DATABASE_URL` before deploying:

```sql
-- 0013_health_retention.sql
-- Adds per-user configurable data retention policy.
-- Default: 0 = retain forever (no automatic deletion).

ALTER TABLE garmin_sync_state
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 0;

-- retention_days = 0 means retain forever.
-- retention_days = 365 means delete snapshots older than 1 year.
-- Users set this via PATCH /api/health/admin/retention.
```

Add to Drizzle schema (`garmin_sync_state` table, new column):
```typescript
retentionDays: integer('retention_days').notNull().default(0),
```

We store retention policy in `garmin_sync_state` (user-level config table) rather than a new table, since it is a per-user health setting and that table is already the per-user config store.

---

## Step 1: Rate Limiting

### 1.1 — `src/lib/health/rate-limit.ts`

Sliding window rate limiter. Uses Upstash Redis in production; falls back to a simple in-memory Map in development (not suitable for multi-instance, but dev runs single instance).

```typescript
// src/lib/health/rate-limit.ts
// Per-user-per-endpoint sliding window rate limiter.
// Uses Upstash Redis in production, in-memory fallback in development.
// Never throws — returns { allowed: boolean; remaining: number; resetAt: number }

export interface RateLimitResult {
  allowed:  boolean
  remaining: number
  resetAt:   number    // Unix epoch ms
}

interface WindowConfig {
  requests: number   // max requests
  windowMs: number   // window size in milliseconds
}

// Per-endpoint limits — tuned to protect expensive operations
const LIMITS: Record<string, WindowConfig> = {
  'snapshots:write':  { requests: 60,  windowMs: 60_000 },     // 60/min  — normal sync
  'snapshots:read':   { requests: 120, windowMs: 60_000 },     // 120/min — dashboard loads
  'trends':           { requests: 30,  windowMs: 60_000 },     // 30/min  — chart refreshes
  'garmin:connect':   { requests: 5,   windowMs: 300_000 },    // 5/5min  — credential changes
  'garmin:sync':      { requests: 10,  windowMs: 600_000 },    // 10/10min — manual syncs
  'ocr':              { requests: 20,  windowMs: 3_600_000 },  // 20/hr   — Vision API calls
  'push:register':    { requests: 10,  windowMs: 60_000 },     // 10/min  — token registration
  'chat':             { requests: 60,  windowMs: 60_000 },     // 60/min  — chat messages
  'sources':          { requests: 60,  windowMs: 60_000 },     // 60/min  — source lookups
  'default':          { requests: 100, windowMs: 60_000 },     // catch-all
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev only)
// ---------------------------------------------------------------------------

const memStore = new Map<string, { count: number; resetAt: number }>()

function memRateLimit(key: string, config: WindowConfig): RateLimitResult {
  const now    = Date.now()
  const entry  = memStore.get(key)

  if (!entry || entry.resetAt <= now) {
    memStore.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.requests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.requests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.requests - entry.count, resetAt: entry.resetAt }
}

// ---------------------------------------------------------------------------
// Upstash sliding window (production)
// ---------------------------------------------------------------------------

async function upstashRateLimit(key: string, config: WindowConfig): Promise<RateLimitResult> {
  const { Ratelimit } = await import('@upstash/ratelimit')
  const { Redis }     = await import('@upstash/redis')

  const redis   = Redis.fromEnv()
  const limiter = new Ratelimit({
    redis,
    limiter:  Ratelimit.slidingWindow(config.requests, `${config.windowMs}ms`),
    prefix:   'chorum_health',
  })

  const { success, remaining, reset } = await limiter.limit(key)
  return { allowed: success, remaining, resetAt: reset }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  userId: string,
  endpoint: keyof typeof LIMITS | string,
): Promise<RateLimitResult> {
  const config = LIMITS[endpoint] ?? LIMITS['default']!
  const key    = `${userId}:${endpoint}`

  const hasUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL)

  try {
    if (hasUpstash) {
      return await upstashRateLimit(key, config)
    }
    return memRateLimit(key, config)
  } catch {
    // Never block the request if rate limiter errors — fail open
    return { allowed: true, remaining: config.requests, resetAt: Date.now() + config.windowMs }
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
  }
}
```

### 1.2 — Apply Rate Limiting to All Health Routes

Add the following pattern to each health API route listed below. The placement is: after `authenticate()`, before any DB operation.

```typescript
// Pattern to add to each route:
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'

// Inside the handler, after `if (!auth) return ...`:
const rl = await checkRateLimit(auth.userId, '<endpoint-key>')
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429, headers: rateLimitHeaders(rl) },
  )
}
```

Apply to these routes with the corresponding endpoint keys:

| Route | Endpoint key |
|-------|-------------|
| `POST /api/health/snapshots` | `'snapshots:write'` |
| `GET /api/health/snapshots` | `'snapshots:read'` |
| `GET /api/health/trends` | `'trends'` |
| `POST /api/health/garmin/connect` | `'garmin:connect'` |
| `DELETE /api/health/garmin/connect` | `'garmin:connect'` |
| `POST /api/health/garmin/sync` | `'garmin:sync'` |
| `POST /api/health/upload/ocr` | `'ocr'` |
| `POST /api/health/push/register` | `'push:register'` |
| `DELETE /api/health/push/register` | `'push:register'` |
| `GET /api/health/sources` (MCP handler) | `'sources'` (apply in `handleHealthSources` — use a sentinel userId `'mcp'` since sources handler has no auth) |

> **Note:** Cron routes (`/api/cron/*`) and the internal push notify route are protected by secret headers, not user auth. Do not add per-user rate limiting to them.

---

## Step 2: PHI Integrity Verification

### 2.1 — `src/lib/health/integrity.ts`

Re-derives the SHA-256 hash from the decrypted payload and compares against the stored `payload_hash`. Any mismatch indicates data tampering or corruption.

```typescript
// src/lib/health/integrity.ts
// PHI integrity verification — re-derives payload hash from decrypted content
// and compares to the stored payload_hash column.
// Used by the integrity cron and can be called on any individual snapshot.

import { decryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess }        from '@/lib/health/audit'

export interface IntegrityResult {
  snapshotId: string
  passed:     boolean
  reason?:    string    // only present on failure
}

/**
 * Verify a single snapshot's integrity.
 * Returns { passed: true } if the re-derived hash matches stored hash.
 * Returns { passed: false, reason: '...' } on mismatch or decryption failure.
 * Never throws.
 */
export function verifySnapshot(snapshot: {
  id:               string
  encryptedPayload: string
  payloadIv:        string
  payloadHash:      string
}): IntegrityResult {
  try {
    const decrypted = decryptPHI(snapshot.encryptedPayload, snapshot.payloadIv)
    const recomputed = hashPHI(decrypted)

    if (recomputed !== snapshot.payloadHash) {
      return {
        snapshotId: snapshot.id,
        passed:     false,
        reason:     'Hash mismatch — payload may have been tampered with or corrupted',
      }
    }
    return { snapshotId: snapshot.id, passed: true }
  } catch (err) {
    return {
      snapshotId: snapshot.id,
      passed:     false,
      reason:     err instanceof Error ? `Decryption failed: ${err.message}` : 'Decryption failed',
    }
  }
}

/**
 * Verify a batch of snapshots. Logs HIPAA audit entry for each failure.
 * Returns summary counts.
 */
export async function verifyBatch(
  snapshots: Parameters<typeof verifySnapshot>[0][],
  userId: string,
): Promise<{ total: number; passed: number; failed: number; failures: IntegrityResult[] }> {
  const failures: IntegrityResult[] = []

  for (const snapshot of snapshots) {
    const result = verifySnapshot(snapshot)
    if (!result.passed) {
      failures.push(result)
      // HIPAA requires logging integrity failures
      await logPhiAccess({
        userId,
        actorId:      'system',
        action:       'integrity_failure',
        resourceType: 'snapshot',
        resourceId:   snapshot.id,
      }).catch(() => {/* never block */})
    }
  }

  return {
    total:    snapshots.length,
    passed:   snapshots.length - failures.length,
    failed:   failures.length,
    failures,
  }
}
```

### 2.2 — `src/app/api/cron/health-integrity-check/route.ts`

Weekly cron. Samples 20% of all snapshots (random selection), verifies each. Writes `integrity_failure` audit entries for mismatches. Designed to complete within Vercel's 60-second cron timeout even for large datasets.

```typescript
// src/app/api/cron/health-integrity-check/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb }                 from '@/db/health'
import { healthSnapshots }          from '@/db/health-schema'
import { verifyBatch }              from '@/lib/health/integrity'
import { sql }                      from 'drizzle-orm'

// Sample rate: check 20% of snapshots per run (rotates through population over 5 weeks)
const SAMPLE_RATE = 0.2
const MAX_PER_RUN = 500   // hard cap — never exceed Vercel timeout

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.HEALTH_INTEGRITY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Random sample using PostgreSQL's TABLESAMPLE (fast, no full scan)
  const samplePct = SAMPLE_RATE * 100
  const rows = await healthDb.execute(
    sql`SELECT id, user_id, encrypted_payload, payload_iv, payload_hash
        FROM health_snapshots
        TABLESAMPLE BERNOULLI(${samplePct})
        LIMIT ${MAX_PER_RUN}`
  ) as Array<{
    id: string
    user_id: string
    encrypted_payload: string
    payload_iv: string
    payload_hash: string
  }>

  if (rows.length === 0) {
    return NextResponse.json({ checked: 0, passed: 0, failed: 0 })
  }

  // Group by user for audit logging
  const byUser = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? []
    list.push(row)
    byUser.set(row.user_id, list)
  }

  let totalPassed = 0
  let totalFailed = 0
  const allFailures: { snapshotId: string; reason?: string }[] = []

  for (const [userId, userRows] of byUser) {
    const mapped = userRows.map(r => ({
      id:               r.id,
      encryptedPayload: r.encrypted_payload,
      payloadIv:        r.payload_iv,
      payloadHash:      r.payload_hash,
    }))
    const result = await verifyBatch(mapped, userId)
    totalPassed += result.passed
    totalFailed += result.failed
    allFailures.push(...result.failures)
  }

  return NextResponse.json({
    checked:  rows.length,
    passed:   totalPassed,
    failed:   totalFailed,
    failures: allFailures,   // IDs + reasons for operator review
  })
}
```

---

## Step 3: Data Retention

### 3.1 — `src/app/api/health/admin/retention/route.ts`

Lets users view and set their own data retention policy. `retention_days = 0` means retain forever.

```typescript
// src/app/api/health/admin/retention/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate }             from '@/lib/customization/auth'
import { healthDb }                 from '@/db/health'
import { healthUserSettings }       from '@/db/health-schema'
import { logPhiAccess }             from '@/lib/health/audit'
import { eq }                       from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await healthDb
    .select({ retentionDays: healthUserSettings.retentionDays })
    .from(healthUserSettings)
    .where(eq(healthUserSettings.userId, auth.userId))
    .limit(1)

  return NextResponse.json({ retentionDays: row?.retentionDays ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { retentionDays?: unknown }
  const days = body.retentionDays

  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 3650) {
    return NextResponse.json({ error: 'retentionDays must be an integer 0–3650 (0 = retain forever)' }, { status: 400 })
  }

  // Use healthUserSettings — a separate table for non-credential preferences.
  // DO NOT write retention policy into garmin_sync_state: those columns require
  // real encrypted credentials and writing empty strings to NOT NULL credential
  // columns will cause the Garmin sync to attempt decryption of '' and circuit-break.
  await healthDb
    .insert(healthUserSettings)
    .values({ userId: auth.userId, retentionDays: days })
    .onConflictDoUpdate({
      target: healthUserSettings.userId,
      set:    { retentionDays: days, updatedAt: new Date() },
    })

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'view', resourceType: 'snapshot' })

  return NextResponse.json({ retentionDays: days })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Purge all snapshots for this user immediately (user-initiated data deletion)
  const { rowCount } = await healthDb.execute(
    require('drizzle-orm').sql`
      DELETE FROM health_snapshots
      WHERE user_id = ${auth.userId}
    `
  ) as { rowCount: number }

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'delete', resourceType: 'snapshot' })

  return NextResponse.json({ deleted: rowCount ?? 0 })
}
```

> **Note on DELETE:** The `DELETE` endpoint is a full data purge — HIPAA right of access / right to erasure. The user must confirm this action on the mobile side before calling it. Do not add this button to any UI without a confirmation dialog.

### 3.2 — `src/app/api/cron/health-data-retention/route.ts`

Monthly cron. For each user with `retention_days > 0`, deletes snapshots older than their policy. Writes deletion audit entries.

```typescript
// src/app/api/cron/health-data-retention/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb }                 from '@/db/health'
import { healthUserSettings }       from '@/db/health-schema'
import { logPhiAccess }             from '@/lib/health/audit'
import { gt, sql }                  from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.HEALTH_RETENTION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find all users with an active retention policy
  const users = await healthDb
    .select({ userId: healthUserSettings.userId, retentionDays: healthUserSettings.retentionDays })
    .from(healthUserSettings)
    .where(gt(healthUserSettings.retentionDays, 0))

  if (users.length === 0) return NextResponse.json({ processed: 0 })

  let totalDeleted = 0
  const results = await Promise.allSettled(
    users.map(async ({ userId, retentionDays }) => {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      const result = await healthDb.execute(
        sql`DELETE FROM health_snapshots
            WHERE user_id = ${userId}
            AND recorded_at < ${cutoff}`
      ) as { rowCount?: number }

      const deleted = result.rowCount ?? 0
      if (deleted > 0) {
        await logPhiAccess({
          userId,
          actorId:      'system',
          action:       'delete',
          resourceType: 'snapshot',
        })
        totalDeleted += deleted
      }
      return deleted
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ processed: users.length, totalDeleted, failed })
}
```

---

## Step 4: Push Receipt Cleanup

### 4.1 — `src/app/api/health/push/receipts/route.ts`

Expo's push service provides delivery receipts 15–30 minutes after sending. This endpoint checks receipts and marks tokens with `DeviceNotRegistered` status as inactive.

```typescript
// src/app/api/health/push/receipts/route.ts
// Checks Expo push receipts and deactivates tokens that returned DeviceNotRegistered.
// Called by the health-push-receipts cron — not called by the mobile client.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb }                 from '@/db/health'
import { pushTokens }               from '@/db/health-schema'
import { eq, inArray }              from 'drizzle-orm'

interface ExpoReceiptResponse {
  data: Record<string, {
    status: 'ok' | 'error'
    message?: string
    details?: { error?: string }
  }>
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.HEALTH_RECEIPTS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { receiptIds?: string[] }
  const { receiptIds } = body

  if (!receiptIds || receiptIds.length === 0) {
    return NextResponse.json({ checked: 0, deactivated: 0 })
  }

  // Fetch receipts from Expo in batches of 300
  const BATCH = 300
  const deadTokenIds: string[] = []

  for (let i = 0; i < receiptIds.length; i += BATCH) {
    const batch   = receiptIds.slice(i, i + BATCH)
    const resp    = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: batch }),
    })
    if (!resp.ok) continue

    const { data } = await resp.json() as ExpoReceiptResponse

    for (const [receiptId, receipt] of Object.entries(data)) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        deadTokenIds.push(receiptId)
      }
    }
  }

  if (deadTokenIds.length === 0) {
    return NextResponse.json({ checked: receiptIds.length, deactivated: 0 })
  }

  // Deactivate dead tokens. Receipt IDs are not the same as push tokens —
  // we mark all tokens associated with the returned IDs as inactive.
  // In practice, operators should store receiptId→token mappings.
  // For Phase 6, we do a best-effort deactivation of tokens matching the receipt IDs.
  // A full receipt→token mapping table is a future enhancement.
  await healthDb
    .update(pushTokens)
    .set({ active: false })
    .where(inArray(pushTokens.token, deadTokenIds))

  return NextResponse.json({ checked: receiptIds.length, deactivated: deadTokenIds.length })
}
```

> **Note on receipt ID → token mapping:** Expo's receipt API returns the same ticket ID that was returned when the push was originally sent. A complete implementation stores `ticketId → pushToken` in a mapping table and looks up the token from the ticket. Phase 6 does best-effort deactivation; the full mapping table is a future enhancement noted in `HEALTH_SPEC_V2.md`.

### 4.2 — `src/app/api/cron/health-push-receipts/route.ts`

Daily receipt check. Collects ticket IDs from the last 24 hours of sent pushes by querying recent push events in the audit log, then calls the receipts endpoint.

```typescript
// src/app/api/cron/health-push-receipts/route.ts
// Runs daily — checks Expo receipts for pushes sent in the last 24h.
// Relies on a ticketId log that must be maintained when pushes are sent.
// Phase 6: stores ticket IDs in phi_audit_log resourceId column as a temporary store.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.HEALTH_RECEIPTS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // In Phase 6 the push/notify endpoint is updated to return ticketIds from Expo.
  // Those IDs are stored in phi_audit_log.resource_id (uuid column abused as text store).
  // For now, the receipt check is a no-op scaffold — wired up when ticket storage is added.
  // TODO: query phi_audit_log WHERE action = 'push_sent' AND created_at > now() - interval '24h'
  //        then call /api/health/push/receipts with collected IDs.

  return NextResponse.json({ message: 'Receipt check scheduled — ticket store not yet implemented', checked: 0 })
}
```

> **Why scaffold this now?** The cron schedule and infrastructure should be in place before the ticket store is built. Adding the cron to `vercel.json` now means it runs silently until the ticket store lands, rather than requiring a separate deployment later.

---

## Step 5: Mobile Biometric Re-auth

### 5.1 — `apps/health-mobile/lib/biometric.ts`

Wraps `expo-local-authentication`. Returns a Promise that resolves `true` if auth succeeded, `false` if user cancelled or hardware unavailable.

```typescript
// apps/health-mobile/lib/biometric.ts
import * as LocalAuthentication from 'expo-local-authentication'

export interface BiometricCheckResult {
  available: boolean
  type:      'fingerprint' | 'facial' | 'iris' | 'none'
}

export async function getBiometricInfo(): Promise<BiometricCheckResult> {
  const available = await LocalAuthentication.hasHardwareAsync()
  if (!available) return { available: false, type: 'none' }

  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!enrolled) return { available: false, type: 'none' }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
  const type: BiometricCheckResult['type'] =
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'facial' :
    types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT) ? 'fingerprint' :
    types.includes(LocalAuthentication.AuthenticationType.IRIS) ? 'iris' : 'none'

  return { available: true, type }
}

/**
 * Prompt for biometric authentication.
 * Returns true if authenticated, false if cancelled or failed.
 * Never throws.
 */
export async function requireBiometric(promptMessage: string): Promise<boolean> {
  const { available } = await getBiometricInfo()
  if (!available) {
    // No biometric hardware — allow action (graceful degradation)
    return true
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel:         'Cancel',
      disableDeviceFallback: false,   // allow PIN fallback
    })
    return result.success
  } catch {
    return false
  }
}
```

### 5.2 — `apps/health-mobile/components/BiometricGate.tsx`

Wraps a sensitive action. Shows a challenge on mount; renders `children` only after successful auth, or an error state on failure.

```typescript
// apps/health-mobile/components/BiometricGate.tsx
import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { requireBiometric } from '@/lib/biometric'

interface BiometricGateProps {
  prompt:    string
  children:  React.ReactNode
  onDenied?: () => void
}

type State = 'checking' | 'granted' | 'denied'

export function BiometricGate({ prompt, children, onDenied }: BiometricGateProps) {
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    void requireBiometric(prompt).then(ok => {
      setState(ok ? 'granted' : 'denied')
      if (!ok) onDenied?.()
    })
  }, [prompt, onDenied])

  if (state === 'checking') {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#60a5fa" />
        <Text style={s.text}>Verifying identity…</Text>
      </View>
    )
  }

  if (state === 'denied') {
    return (
      <View style={s.center}>
        <Text style={s.denied}>Authentication required</Text>
        <TouchableOpacity style={s.btn} onPress={() => {
          setState('checking')
          void requireBiometric(prompt).then(ok => {
            setState(ok ? 'granted' : 'denied')
            if (!ok) onDenied?.()
          })
        }}>
          <Text style={s.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' },
  text:   { color: '#9ca3af', marginTop: 12, fontSize: 14 },
  denied: { color: '#f87171', fontSize: 16, fontWeight: '600' },
  btn:    { marginTop: 16, backgroundColor: '#1f2937', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText:{ color: '#e5e7eb', fontWeight: '600' },
})
```

### 5.3 — Update `apps/health-mobile/app/(tabs)/upload.tsx`

Wrap the `UploadSheet` in `BiometricGate` when opened. Edit the existing file — replace the `showSheet &&` conditional:

```typescript
// Replace:
{showSheet && (
  <UploadSheet
    onClose={() => setShowSheet(false)}
    onUploaded={handleUploaded}
  />
)}

// With:
{showSheet && (
  <BiometricGate
    prompt="Confirm identity to upload a health document"
    onDenied={() => setShowSheet(false)}
  >
    <UploadSheet
      onClose={() => setShowSheet(false)}
      onUploaded={handleUploaded}
    />
  </BiometricGate>
)}
```

Add the import at the top of `upload.tsx`:
```typescript
import { BiometricGate } from '@/components/BiometricGate'
```

---

## Step 6: Streaming Chat on Mobile

Replace the non-streaming `chat()` method in `apps/health-mobile/lib/api.ts` and update `chat.tsx` to consume the SSE stream using React Native's `fetch` with `ReadableStream`.

### 6.1 — Update `apps/health-mobile/lib/api.ts`

Replace the existing `chat` method:

```typescript
// Replace the existing chat() method in HealthApiClient with:

async *streamChat(message: string): AsyncGenerator<string, void, unknown> {
  const token = await SecureStore.getItemAsync('auth_token')
  if (!token) throw new Error('Not authenticated')

  const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: message }],
    }),
    // React Native 0.74+ supports streaming fetch
  })

  if (!response.ok) throw new Error(`Chat failed: ${response.status}`)
  if (!response.body) throw new Error('No response body')

  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data) as { delta?: string }
          if (typeof parsed.delta === 'string') yield parsed.delta
        } catch { /* skip malformed SSE frames */ }
      }
    }
  }
}
```

### 6.2 — Update `apps/health-mobile/app/(tabs)/chat.tsx`

Replace the `send` callback to use the generator:

```typescript
// Replace the existing send() in chat.tsx:

const send = useCallback(async () => {
  const text = input.trim()
  if (!text || sending) return

  const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
  const assistantId = (Date.now() + 1).toString()
  const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' }

  setMessages(prev => [...prev, userMsg, assistantMsg])
  setInput('')
  setSending(true)

  try {
    for await (const delta of healthApi.streamChat(text)) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content + delta } : m
      ))
    }
  } catch {
    setMessages(prev => prev.map(m =>
      m.id === assistantId ? { ...m, content: 'Sorry, I couldn\'t process that. Please try again.' } : m
    ))
  } finally {
    setSending(false)
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }
}, [input, sending])
```

---

## Step 7: Key Rotation Script

### 7.1 — `src/scripts/rotate-health-key.ts`

Re-encrypts every `health_snapshots` row under a new `HEALTH_ENCRYPTION_KEY`. Run manually when rotating keys. Never automated — operator action only.

```typescript
// src/scripts/rotate-health-key.ts
// PHI key rotation script. Run with:
//   NEW_HEALTH_ENCRYPTION_KEY=<new-key> npx tsx src/scripts/rotate-health-key.ts
//
// What it does:
//   1. Decrypts each snapshot with the OLD key (HEALTH_ENCRYPTION_KEY env var)
//   2. Re-encrypts with the NEW key (NEW_HEALTH_ENCRYPTION_KEY env var)
//   3. Updates the row in-place
//   4. Reports progress and errors without stopping
//
// Safety:
//   - Run in a transaction per batch of 100 rows
//   - Stops on 3 consecutive batch errors
//   - Never logs decrypted PHI
//   - The old key must remain set in HEALTH_ENCRYPTION_KEY until the script completes
//   - After script completes: set HEALTH_ENCRYPTION_KEY = NEW_HEALTH_ENCRYPTION_KEY
//     and remove NEW_HEALTH_ENCRYPTION_KEY from all environments

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as healthSchema from '../db/health-schema'
import { encryptPHI, decryptPHI, hashPHI } from '../lib/health/crypto'
import { sql, gt } from 'drizzle-orm'

const NEW_KEY = process.env.NEW_HEALTH_ENCRYPTION_KEY
if (!NEW_KEY) {
  console.error('NEW_HEALTH_ENCRYPTION_KEY is required')
  process.exit(1)
}
if (NEW_KEY === process.env.HEALTH_ENCRYPTION_KEY) {
  console.error('NEW_HEALTH_ENCRYPTION_KEY must differ from HEALTH_ENCRYPTION_KEY')
  process.exit(1)
}

const BATCH_SIZE    = 100
const MAX_FAILURES  = 3

async function main() {
  const client = postgres(process.env.HEALTH_DATABASE_URL!, { prepare: false })
  const db     = drizzle(client, { schema: healthSchema })

  console.log('Starting PHI key rotation...')

  let processed = 0
  let errors    = 0
  let failures  = 0
  let lastId    = ''    // cursor for pagination

  while (true) {
    // Fetch next batch
    const rows = await client`
      SELECT id, encrypted_payload, payload_iv
      FROM health_snapshots
      WHERE id > ${lastId}
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    ` as Array<{ id: string; encrypted_payload: string; payload_iv: string }>

    if (rows.length === 0) break

    // Process batch
    try {
      await client.begin(async sql => {
        for (const row of rows) {
          // Decrypt with OLD key
          const decrypted  = decryptPHI(row.encrypted_payload, row.payload_iv)
          // Re-encrypt with NEW key (temporarily override env)
          const savedKey   = process.env.HEALTH_ENCRYPTION_KEY
          process.env.HEALTH_ENCRYPTION_KEY = NEW_KEY!
          const reEncrypted = encryptPHI(decrypted)
          const newHash     = hashPHI(decrypted)
          process.env.HEALTH_ENCRYPTION_KEY = savedKey!

          await sql`
            UPDATE health_snapshots SET
              encrypted_payload = ${reEncrypted.ciphertext},
              payload_iv        = ${reEncrypted.iv + ':' + reEncrypted.tag},
              payload_hash      = ${newHash}
            WHERE id = ${row.id}
          `
        }
      })

      processed += rows.length
      failures   = 0
      console.log(`Rotated ${processed} rows...`)
    } catch (err) {
      errors++
      failures++
      console.error(`Batch error (${failures}/${MAX_FAILURES}):`, err instanceof Error ? err.message : err)
      if (failures >= MAX_FAILURES) {
        console.error('Too many consecutive failures — aborting rotation.')
        console.error(`Rotated ${processed} rows before abort.`)
        process.exit(1)
      }
    }

    lastId = rows.at(-1)!.id
  }

  await client.end()
  console.log(`\nRotation complete. ${processed} rows rotated, ${errors} errors.`)
  console.log('\nNext steps:')
  console.log('  1. Set HEALTH_ENCRYPTION_KEY = NEW_HEALTH_ENCRYPTION_KEY in all environments')
  console.log('  2. Remove NEW_HEALTH_ENCRYPTION_KEY from all environments')
  console.log('  3. Redeploy the application')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

---

## Step 8: `vercel.json` — Add Remaining Crons

Final complete `crons` array after Phase 6:

```json
"crons": [
  { "path": "/api/cron/health-garmin-sync",    "schedule": "0 */6 * * *"  },
  { "path": "/api/cron/health-checkup",        "schedule": "0 8 * * 1"    },
  { "path": "/api/cron/health-push-digest",    "schedule": "15 8 * * 1"   },
  { "path": "/api/cron/health-integrity-check","schedule": "0 2 * * 0"    },
  { "path": "/api/cron/health-data-retention", "schedule": "0 3 1 * *"    },
  { "path": "/api/cron/health-push-receipts",  "schedule": "0 */1 * * *"  }
]
```

| Cron | Schedule | Description |
|------|----------|-------------|
| `health-garmin-sync` | Every 6h | Pulls Garmin data for all users |
| `health-checkup` | Monday 8:00 AM UTC | Weekly LLM health analysis |
| `health-push-digest` | Monday 8:15 AM UTC | Push notification with checkup summary |
| `health-integrity-check` | Sunday 2:00 AM UTC | 20% PHI integrity sample |
| `health-data-retention` | 1st of each month 3:00 AM UTC | Enforce user retention policies |
| `health-push-receipts` | Every hour | Clean up dead Expo push tokens |

---

## Validation Checklist

### Rate Limiting
- [ ] `POST /api/health/upload/ocr` returns 429 after 20 requests within 1 hour from the same user
- [ ] `POST /api/health/garmin/connect` returns 429 after 5 requests within 5 minutes
- [ ] `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers present on all health responses
- [ ] Rate limiter failure (Redis unavailable) does NOT block the request — fails open
- [ ] Dev environment works without Upstash credentials (in-memory fallback)

### Integrity
- [ ] `verifySnapshot` returns `{ passed: false }` when `payloadHash` is manually corrupted in DB
- [ ] `verifySnapshot` returns `{ passed: false }` when ciphertext is corrupted (decryption throws)
- [ ] Integrity failure writes an `integrity_failure` entry to `phi_audit_log`
- [ ] Integrity cron returns `{ checked: N, passed: N, failed: 0 }` for unmodified data
- [ ] Integrity cron completes within 60 seconds for 500 rows

### Retention
- [ ] `PATCH /api/health/admin/retention` with `retentionDays: 365` stores the value
- [ ] `GET /api/health/admin/retention` returns the stored value
- [ ] `PATCH` with `retentionDays: -1` returns 400
- [ ] `PATCH` with `retentionDays: 3651` returns 400
- [ ] Retention cron deletes rows older than `retention_days` for users with a policy set
- [ ] Retention cron does NOT delete rows for users with `retention_days = 0`
- [ ] Deletion writes an audit entry with `action: 'delete'`

### Push Receipts
- [ ] Receipt endpoint deactivates tokens in DB when `DeviceNotRegistered` is returned
- [ ] Receipt cron runs hourly without error (even as no-op scaffold)

### Biometrics
- [ ] Opening the upload tab prompts for biometric auth on devices with enrolled biometrics
- [ ] Cancelling biometric dismisses the upload sheet
- [ ] Biometric gate gracefully skips on devices without enrolled biometrics (passes through)
- [ ] `BiometricGate` shows "Try Again" on failure

### Streaming Chat
- [ ] Chat tab streams tokens incrementally (text appears as it arrives)
- [ ] Network error during stream shows error message in bubble
- [ ] Empty stream (`[DONE]` immediately) shows no content — graceful
- [ ] TypeScript compiles with `npx tsc --noEmit` after all changes

### Key Rotation
- [ ] `rotate-health-key.ts` script runs to completion on a test DB with 10 rows
- [ ] After rotation, existing records decrypt correctly with the new key
- [ ] After rotation, records are NOT decryptable with the old key
- [ ] Script aborts after 3 consecutive batch failures

### No Regressions
- [ ] All Phase 1–5 routes still respond correctly after rate limiting is added
- [ ] Garmin sync cron still runs — it uses service auth, not per-user rate limiting
- [ ] Integrity check on a freshly-synced dataset passes 100%

---

## HIPAA §164.312 Technical Safeguards Mapping

| Safeguard | Implementation | Phase |
|-----------|----------------|-------|
| Access control (§164.312(a)(1)) | Bearer token auth, `authenticate()`, RLS on all tables | 1 |
| Unique user identification (§164.312(a)(2)(i)) | `user_id uuid` on every table; auth tied to NextAuth session | 1 |
| Automatic logoff (§164.312(a)(2)(iii)) | API token TTL (set at creation); biometric gate on mobile | 1/6 |
| Encryption in transit (§164.312(e)(2)(ii)) | HTTPS enforced by Vercel; no HTTP fallback | 1 |
| Encryption at rest (§164.312(a)(2)(iv)) | AES-256-GCM per-record; separate `HEALTH_ENCRYPTION_KEY` | 1 |
| Audit controls (§164.312(b)) | `phi_audit_log` on all access; view/create/delete/integrity events | 1 |
| Integrity controls (§164.312(c)(1)) | SHA-256 dedup hash; weekly integrity cron with 20% sample | 1/6 |
| Transmission security (§164.312(e)(1)) | TLS 1.2+ enforced; Supabase Storage enforces HTTPS | 1 |
| De-identification before LLM injection (§164.514(b)) | `deidentifyObject()` in checkup cron and health_checkup handler | 3 |
| Minimum necessary access (§164.502(b)) | `read:health` / `write:health` scopes; RLS by `user_id` | 4 |
| Data retention / right to erasure | User-configurable retention policy; DELETE endpoint | 6 |
| Key rotation | `rotate-health-key.ts` operator script | 6 |
| Rate limiting (denial-of-service protection) | Sliding window per-user-per-endpoint via Upstash Redis | 6 |

---

## Why These Decisions Were Made

### Why rate limiting is in-route (not middleware)

Next.js Edge middleware cannot import `@upstash/ratelimit` without `export const runtime = 'edge'`, but all health routes need `runtime = 'nodejs'` for crypto and Sharp. Putting rate limiting in-route with `checkRateLimit()` keeps the runtime constraint clean and makes the limit per-route explicit and auditable.

### Why integrity check uses TABLESAMPLE BERNOULLI

A full table scan of `health_snapshots` would timeout for large datasets within Vercel's 60-second cron limit. `TABLESAMPLE BERNOULLI(20)` lets PostgreSQL skip ~80% of pages at the storage level — much faster than `ORDER BY random() LIMIT N`. The 5-week rotation means every row is checked approximately once per month.

### Why retention policy is stored in `garmin_sync_state`

A dedicated `user_health_settings` table would be cleaner architecturally, but it requires a new migration and a new Drizzle schema entry that has no other columns in Phase 6. `garmin_sync_state` is already the per-user health config table (it holds Garmin credentials and sync state). Adding `retention_days` is a single column addition via `ALTER TABLE`. A dedicated settings table is appropriate if more user settings are added in future phases.

### Why the key rotation script is manual-only

Automated key rotation risks a partial-rotation state if a deployment happens mid-run. The script uses a cursor-based approach that is safe to restart, but the key switchover (updating the environment variable) must be coordinated with a deployment. Automating that coordination is complex enough to warrant a dedicated operations procedure rather than code.

### Why streaming chat uses `for await...of` instead of callbacks

The `AsyncGenerator` pattern from Phase 5B's `AgentInterface.chat()` is already established in the codebase. Using `for await...of` on `streamChat()` mirrors that pattern exactly, making the mobile implementation consistent with the web shell's streaming model.
