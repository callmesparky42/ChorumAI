# Health Phase 3 Specification: Garmin + Cron + Trends + De-identification

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Ready for execution
**Prerequisite:** Health Phase 1 complete (health DB live, `crypto.ts`, `audit.ts`, snapshot API).
**Prerequisite:** Health Phase 2 complete (web dashboard live, MCP health tool stubs registered).
**Guardian gates:** None — health layer is isolated from Chorum core.

---

## Agent Instructions

You are executing **Health Phase 3** — the server intelligence layer of Chorum Health. Your job is to bring the backend to full capability: Garmin credential storage, automated HRV sync with circuit breaker, HIPAA-compliant PHI de-identification, health trends computation, and the weekly checkup cron that produces the first LLM-generated health analysis. When Phase 3 is done, health data flows automatically from Garmin every 6 hours, gets analyzed weekly by the Health Monitor persona, and the `health_checkup` MCP tool returns real LLM analysis instead of the Phase 2 stub.

Read this document completely before writing a single file. Every decision is locked. If something is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. `src/lib/health/garmin-transformer.ts` — Garmin API response normalizer
2. `src/lib/health/deidentify.ts` — HIPAA Safe Harbor 18-identifier scrubber
3. `src/app/api/health/garmin/connect/route.ts` — Garmin credential storage endpoint
4. `src/app/api/health/garmin/sync/route.ts` — Manual/ad-hoc sync trigger
5. `src/app/api/health/trends/route.ts` — Moving averages, anomaly detection, correlations
6. `src/app/api/cron/health-garmin-sync/route.ts` — Automated Garmin sync cron (every 6h)
7. `src/app/api/cron/health-checkup/route.ts` — Weekly health analysis cron (Monday 8 AM UTC)
8. `src/lib/customization/health-handlers.ts` — Update `health_checkup` handler to full LLM analysis
9. `vercel.json` — Add 2 cron entries
10. `src/__tests__/health/garmin-transformer.test.ts` — Transformer unit tests
11. `src/__tests__/health/deidentify.test.ts` — De-identification unit tests (40 cases)
12. `src/__tests__/health/trends.test.ts` — Trend computation unit tests

**What you will NOT produce:**
- Any mobile app code — that is Phase 4
- Push notification delivery — Phase 4 delivers tokens; Phase 5 delivers notifications
- `mobile-init` auth route — that is Phase 4
- The `health_snapshot`, `health_trends`, `health_sources` MCP handlers — those are Phase 2 (already done)
- Any modification to `src/db/index.ts`, `src/db/schema.ts`, or any existing Layer 0–5 files
- Any `any` types or `@ts-ignore` comments — use `unknown` + type guards

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Full architecture, Phase 3 section |
| Phase 1 Spec | `Health App/HEALTH_PHASE_1_SPEC.md` | `crypto.ts`, `audit.ts`, health DB client patterns |
| Phase 2 Spec | `Health App/HEALTH_PHASE_2_SPEC.md` | `health-handlers.ts` stub to replace, MCP tool signatures |
| Chorum MCP Route | `chorum_v2/src/app/api/mcp/route.ts` | `callProvider()` pattern used in checkup handler |

---

## Step 0: Human Prerequisites (Not Agent Work)

> [!IMPORTANT]
> These actions require human execution before the agent proceeds.

### 0.1 — Install `garmin-connect`

Run from `chorum_v2/`:
```bash
npm install garmin-connect
npm install --save-dev @types/node
```

`garmin-connect` is an unofficial library with no TypeScript declarations. You will use `unknown` return types and narrow with runtime checks in `garmin-transformer.ts`. This is intentional — Garmin changes their API response shape without notice.

### 0.2 — Verify Phase 1 Deliverables Present

Before proceeding, confirm these files exist:
- `src/lib/health/crypto.ts` — `encryptPHI`, `decryptPHI`, `hashPHI`
- `src/lib/health/audit.ts` — `logPhiAccess`
- `src/db/health-schema.ts` — `healthSnapshots`, `healthSources`, `phiAuditLog` tables
- `src/db/health.ts` — `healthDb` client

> **Note:** `garminSyncState` does NOT come from Phase 1. Phase 3 adds it to `health-schema.ts` as part of Garmin credential storage. If you see it missing, that is expected — Phase 3 creates it.

If any are missing, stop and complete Phase 1 first.

### 0.3 — Verify Phase 2 Deliverables Present

Confirm these files exist:
- `src/lib/customization/health-handlers.ts` — Phase 2 stubs; you will replace the `health_checkup` handler in Step 8
- `src/app/(shell)/health/page.tsx` — web dashboard exists

---

## Step 1: Garmin Transformer

**File:** `src/lib/health/garmin-transformer.ts`

This module accepts raw Garmin API responses (typed as `unknown`) and produces validated, typed payloads matching `@chorum/health-types`. All field access must be defensive — Garmin's response shape changes without notice.

```typescript
import type { GarminDailyPayload, GarminHRVPayload } from '@chorum/health-types'

// ---- Type guards ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safeNumber(v: unknown, fallback: number | null = null): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (isFinite(n)) return n
  }
  return fallback
}

function safeString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// ---- Transformers ----

/**
 * Transform raw Garmin daily summary response to GarminDailyPayload.
 * Unknown fields are silently dropped. All fields have safe fallbacks.
 * If the raw object is malformed beyond recovery, returns null.
 */
export function transformGarminDaily(raw: unknown): GarminDailyPayload | null {
  if (!isRecord(raw)) return null

  // Garmin sometimes wraps the summary in a `dailySummary` key
  const data = isRecord(raw['dailySummary']) ? raw['dailySummary'] : raw

  const date = safeString(data['calendarDate'] ?? data['startTimeLocal'])
  if (!date) return null  // date is the primary key — reject if missing

  return {
    date,
    heartRateAvgBpm:     safeNumber(data['averageHeartRateInBeatsPerMinute'] ?? data['averageHeartRate']),
    heartRateRestingBpm: safeNumber(data['restingHeartRateInBeatsPerMinute'] ?? data['restingHeartRate']),
    heartRateMaxBpm:     safeNumber(data['maxHeartRateInBeatsPerMinute'] ?? data['maxHeartRate']),
    stepsTotal:          safeNumber(data['totalSteps'] ?? data['steps']),
    activeCalories:      safeNumber(data['activeKilocalories'] ?? data['activeCalories']),
    totalCalories:       safeNumber(data['totalKilocalories'] ?? data['totalCalories']),
    distanceMeters:      safeNumber(data['totalDistanceInMeters'] ?? data['distanceInMeters']),
    sleepDurationMinutes: safeNumber(
      data['sleepingSeconds'] != null
        ? (safeNumber(data['sleepingSeconds']) ?? 0) / 60
        : data['sleepDurationMinutes']
    ),
    sleepScore:          safeNumber(data['sleepScore'] ?? data['averageSleepStress']),
    stressAvg:           safeNumber(data['averageStressLevel'] ?? data['averageStress']),
    bodyBatteryEnd:      safeNumber(data['bodyBatteryMostRecentValue'] ?? data['bodyBatteryEnd']),
  }
}

/**
 * Transform raw Garmin HRV summary response to GarminHRVPayload.
 * Returns null if the response lacks usable HRV data.
 */
export function transformGarminHRV(raw: unknown): GarminHRVPayload | null {
  if (!isRecord(raw)) return null

  // Garmin nests HRV data differently across API versions
  const data = isRecord(raw['hrvSummary']) ? raw['hrvSummary']
             : isRecord(raw['hrv'])        ? raw['hrv']
             : raw

  const date = safeString(data['calendarDate'] ?? data['startTimestampLocal'])
  if (!date) return null

  const weeklyAvg = safeNumber(data['weeklyAvg'] ?? data['hrvWeeklyAverage'])
  const lastNight = safeNumber(data['lastNight'] ?? data['hrvLastNight'])

  if (weeklyAvg === null && lastNight === null) return null  // no usable HRV data

  return {
    date,
    hrvRmssdMs:    safeNumber(data['lastNightFive'] ?? data['lastNightAvg'] ?? lastNight),
    hrvWeeklyAvg:  weeklyAvg,
    hrvLastNight:  lastNight,
    hrvStatus:     safeString(data['status'] ?? data['hrvStatus']),
  }
}
```

**Invariants:**
- Both functions return `null` rather than throwing when input is malformed
- No field access without an `isRecord` guard or nullish coalescing fallback
- `date` field is required — both functions return `null` if date is absent

---

## Step 2: PHI De-identification

**File:** `src/lib/health/deidentify.ts`

This is the highest HIPAA-risk module. It implements HIPAA Safe Harbor §164.514(b) — all 18 identifier categories must be stripped. Clinical values must pass through unmodified.

```typescript
/**
 * HIPAA Safe Harbor de-identification (§164.514(b)).
 *
 * Strips all 18 identifier types. Clinical values (lab results,
 * vital signs, HRV readings, units) pass through unchanged.
 *
 * DO NOT use for anything other than PHI scrubbing before LLM injection.
 * This is one-way — you cannot recover the original from the output.
 */

// ---- Identifier patterns (HIPAA Safe Harbor 18 categories) ----

const PATTERNS: Array<{ label: string; pattern: RegExp; replacement: string }> = [
  // 1. Names — Title-cased two-word combos (heuristic; false-positive rate is acceptable)
  { label: 'NAME',   pattern: /\b[A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\b/g,           replacement: '[NAME]' },
  // 2. Geographic subdivisions smaller than state — ZIP codes
  { label: 'ZIP',    pattern: /\b\d{5}(?:-\d{4})?\b/g,                              replacement: '[ZIP]' },
  // 3. Dates (except year)
  { label: 'DATE',   pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,            replacement: '[DATE]' },
  { label: 'DATE',   pattern: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi, replacement: '[DATE]' },
  { label: 'DATE',   pattern: /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/gi,  replacement: '[DATE]' },
  // 4. Phone numbers
  { label: 'PHONE',  pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, replacement: '[PHONE]' },
  // 5. Fax (same pattern as phone — fax is a separate HIPAA identifier)
  // (covered by PHONE pattern above)
  // 6. Email addresses
  { label: 'EMAIL',  pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  // 7. Social Security Numbers
  { label: 'SSN',    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                             replacement: '[SSN]' },
  // 8. Medical Record Numbers — typically long numeric IDs
  { label: 'MRN',    pattern: /\b(?:MRN|Medical Record(?:\s+Number)?|Record #?)\s*:?\s*[\w\-]+/gi, replacement: '[MRN]' },
  // 9. Health plan beneficiary numbers
  { label: 'PLAN_ID', pattern: /\b(?:Member|Policy|Plan)\s*(?:ID|#|No\.?)\s*:?\s*[\w\-]+/gi, replacement: '[PLAN_ID]' },
  // 10. Account numbers
  { label: 'ACCOUNT', pattern: /\b(?:Account|Acct\.?)\s*(?:No\.?|#|Number)\s*:?\s*[\w\-]+/gi, replacement: '[ACCOUNT]' },
  // 11. Certificate/license numbers
  { label: 'LICENSE', pattern: /\b(?:License|Certificate)\s*(?:No\.?|#|Number)\s*:?\s*[\w\-]{4,}/gi, replacement: '[LICENSE]' },
  // 12. VIN / serial numbers — 17-char alphanumeric VINs
  { label: 'VIN',    pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,                           replacement: '[VIN]' },
  // 13. Device identifiers — generic long serial/device IDs (10+ digit numeric)
  { label: 'DEVICE_ID', pattern: /\b\d{10,}\b/g,                                    replacement: '[ID]' },
  // 14. URLs
  { label: 'URL',    pattern: /https?:\/\/[^\s"'<>]+/gi,                             replacement: '[URL]' },
  // 15. IP addresses
  { label: 'IP',     pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,                       replacement: '[IP]' },
  // 16. Biometric identifiers — finger/voice prints are free-form text; no reliable pattern
  // 17. Full-face photographs — not applicable to text de-identification
  // 18. Any other unique identifying number — catch-all for formatted IDs
  { label: 'ID',     pattern: /\b[A-Z]{2,4}\d{6,}\b/g,                              replacement: '[ID]' },
]

/**
 * De-identify a text string by scrubbing all HIPAA Safe Harbor identifiers.
 *
 * @param text — Raw text that may contain PHI
 * @returns De-identified text safe for LLM injection
 */
export function deidentify(text: string): string {
  let result = text
  for (const { pattern, replacement } of PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * De-identify a structured object. Recursively scrubs all string values.
 * Non-string values (numbers, booleans) pass through unchanged — clinical
 * numeric values must not be altered.
 */
export function deidentifyObject(obj: unknown): unknown {
  if (typeof obj === 'string') return deidentify(obj)
  if (Array.isArray(obj)) return obj.map(deidentifyObject)
  if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, deidentifyObject(v)])
    )
  }
  return obj  // number, boolean, null, undefined — pass through
}
```

**Invariants:**
- `deidentify()` is pure — same input always produces same output
- Numeric values are NEVER altered — pass `deidentifyObject()` instead of wrapping numbers in strings before calling this
- Clinical strings like `"HR: 72 bpm"`, `"HRV: 45ms"`, `"K+: 4.1 mEq/L"` must pass through unchanged (verified in tests)
- False positives (e.g., `[NAME]` replacing a doctor's title in a note) are acceptable — false negatives (missed PHI reaching LLM) are not

---

## Step 3: Garmin Connect Route

**File:** `src/app/api/health/garmin/connect/route.ts`

```typescript
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { encryptPHI } from '@/lib/health/crypto'
import { healthDb } from '@/db/health'
import { garminSyncState } from '@/db/health-schema'
import { eq } from 'drizzle-orm'
// garmin-connect has no type declarations — import as require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GarminConnect } = require('garmin-connect') as { GarminConnect: new () => GarminConnectClient }

interface GarminConnectClient {
  login(username: string, password: string): Promise<unknown>
  getUserProfile(): Promise<unknown>
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth.userId

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (
    typeof body !== 'object' || body === null ||
    typeof (body as Record<string, unknown>)['username'] !== 'string' ||
    typeof (body as Record<string, unknown>)['password'] !== 'string'
  ) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 })
  }

  const { username, password } = body as { username: string; password: string }

  // Validate credentials before storing — attempt a real Garmin API call
  const client = new GarminConnect()
  try {
    await client.login(username, password)
    await client.getUserProfile()
  } catch {
    return NextResponse.json(
      { error: 'Garmin login failed. Check credentials and try again.' },
      { status: 422 }
    )
  }

  // Encrypt credentials — use per-record IV (encryptPHI handles this internally)
  const encryptedUsername = encryptPHI({ value: username })
  const encryptedPassword = encryptPHI({ value: password })

  // Upsert — one row per user
  await healthDb
    .insert(garminSyncState)
    .values({
      userId,
      encryptedUsername: encryptedUsername.ciphertext,
      encryptedPassword: encryptedPassword.ciphertext,
      credsIv: `${encryptedUsername.iv}:${encryptedPassword.iv}`,  // store both IVs together
      consecutiveFailures: 0,
      circuitOpen: false,
    })
    .onConflictDoUpdate({
      target: garminSyncState.userId,
      set: {
        encryptedUsername: encryptedUsername.ciphertext,
        encryptedPassword: encryptedPassword.ciphertext,
        credsIv: `${encryptedUsername.iv}:${encryptedPassword.iv}`,
        consecutiveFailures: 0,
        circuitOpen: false,
        circuitOpenedAt: null,
        updatedAt: new Date(),
      },
    })

  return NextResponse.json({ ok: true, message: 'Garmin credentials stored and verified.' })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await healthDb
    .delete(garminSyncState)
    .where(eq(garminSyncState.userId, auth.userId))

  return NextResponse.json({ ok: true })
}
```

---

## Step 4: Garmin Sync Route (Manual/Ad-hoc)

**File:** `src/app/api/health/garmin/sync/route.ts`

This is the on-demand sync endpoint. The automated cron calls the same core logic via a shared function. Extract the sync logic into `src/lib/health/garmin-sync.ts` so both the cron and this route call it.

**File:** `src/lib/health/garmin-sync.ts`

```typescript
import { healthDb } from '@/db/health'
import { garminSyncState, healthSnapshots } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { transformGarminDaily, transformGarminHRV } from '@/lib/health/garmin-transformer'
import { eq, and, lt } from 'drizzle-orm'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GarminConnect } = require('garmin-connect') as { GarminConnect: new () => GarminConnectClient }

interface GarminConnectClient {
  login(username: string, password: string): Promise<unknown>
  getDailyStressData(date: string): Promise<unknown>
  getDailySummary(date: string): Promise<unknown>
  getHRV(date: string): Promise<unknown>
}

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_RESET_HOURS = 24

export interface GarminSyncResult {
  userId: string
  snapshotsCreated: number
  skippedDuplicates: number
  error?: string
}

export async function syncGarminForUser(userId: string): Promise<GarminSyncResult> {
  const rows = await healthDb
    .select()
    .from(garminSyncState)
    .where(eq(garminSyncState.userId, userId))
    .limit(1)

  if (rows.length === 0) {
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: 'No Garmin credentials found' }
  }

  const state = rows[0]

  // Circuit breaker — check if open, auto-reset after 24h
  if (state.circuitOpen) {
    const resetCutoff = new Date(Date.now() - CIRCUIT_RESET_HOURS * 60 * 60 * 1000)
    if (state.circuitOpenedAt && state.circuitOpenedAt > resetCutoff) {
      return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: 'Circuit breaker open — Garmin sync suspended' }
    }
    // Auto-reset: enough time has passed
    await healthDb
      .update(garminSyncState)
      .set({ circuitOpen: false, circuitOpenedAt: null, consecutiveFailures: 0, updatedAt: new Date() })
      .where(eq(garminSyncState.userId, userId))
  }

  // Decrypt credentials
  const [usernameIv, passwordIv] = state.credsIv.split(':')
  let username: string, password: string
  try {
    username = (decryptPHI(state.encryptedUsername, usernameIv) as { value: string }).value
    password = (decryptPHI(state.encryptedPassword, passwordIv) as { value: string }).value
  } catch {
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: 'Failed to decrypt Garmin credentials' }
  }

  // Fetch from Garmin
  let dailyRaw: unknown, hrvRaw: unknown
  try {
    const client = new GarminConnect()
    await client.login(username, password)

    const today = new Date().toISOString().split('T')[0]
    const syncDate = state.syncCursor ?? today

    dailyRaw = await client.getDailySummary(syncDate)
    hrvRaw   = await client.getHRV(syncDate)

    // Reset circuit on success
    await healthDb
      .update(garminSyncState)
      .set({ consecutiveFailures: 0, lastSyncAt: new Date(), syncCursor: today, updatedAt: new Date() })
      .where(eq(garminSyncState.userId, userId))
  } catch (err) {
    // Increment failure counter; open circuit if threshold reached
    const newFailures = (state.consecutiveFailures ?? 0) + 1
    const openCircuit = newFailures >= CIRCUIT_FAILURE_THRESHOLD

    await healthDb
      .update(garminSyncState)
      .set({
        consecutiveFailures: newFailures,
        circuitOpen: openCircuit,
        circuitOpenedAt: openCircuit ? new Date() : state.circuitOpenedAt,
        updatedAt: new Date(),
      })
      .where(eq(garminSyncState.userId, userId))

    const msg = err instanceof Error ? err.message : 'Unknown Garmin API error'
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: msg }
  }

  // Transform + store snapshots
  let created = 0, skipped = 0

  async function storeSnapshot(type: string, payload: unknown): Promise<void> {
    const hash = hashPHI(payload)
    const existing = await healthDb
      .select({ id: healthSnapshots.id })
      .from(healthSnapshots)
      .where(and(eq(healthSnapshots.userId, userId), eq(healthSnapshots.payloadHash, hash)))
      .limit(1)

    if (existing.length > 0) { skipped++; return }

    const encrypted = encryptPHI(payload)
    await healthDb.insert(healthSnapshots).values({
      userId,
      type,
      recordedAt: new Date(),
      source: 'garmin',
      encryptedPayload: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadHash: hash,
    })

    await logPhiAccess({
      userId,
      actorId: userId,
      action: 'create',
      resourceType: 'snapshot',
    })

    created++
  }

  const daily = transformGarminDaily(dailyRaw)
  if (daily) await storeSnapshot('garmin_daily', daily)

  const hrv = transformGarminHRV(hrvRaw)
  if (hrv) await storeSnapshot('garmin_hrv', hrv)

  return { userId, snapshotsCreated: created, skippedDuplicates: skipped }
}
```

**File:** `src/app/api/health/garmin/sync/route.ts`

```typescript
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { syncGarminForUser } from '@/lib/health/garmin-sync'

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await syncGarminForUser(auth.userId)

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  }

  return NextResponse.json({
    ok: true,
    snapshotsCreated: result.snapshotsCreated,
    skippedDuplicates: result.skippedDuplicates,
  })
}
```

---

## Step 5: Health Trends Route

**File:** `src/app/api/health/trends/route.ts`

```typescript
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { logPhiAccess } from '@/lib/health/audit'
import { decryptPHI } from '@/lib/health/crypto'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { eq, and, gte, desc } from 'drizzle-orm'
import type { TrendResult } from '@chorum/health-types'

const VALID_TYPES = ['hr', 'hrv', 'sleep', 'steps'] as const
type TrendType = typeof VALID_TYPES[number]

function isValidType(v: string): v is TrendType {
  return (VALID_TYPES as readonly string[]).includes(v)
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const typeParam = searchParams.get('type') ?? 'hr'
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10), 7), 90)

  if (!isValidType(typeParam)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  // Map URL type param to snapshot type in DB
  const snapshotTypeMap: Record<TrendType, string> = {
    hr:    'garmin_daily',
    hrv:   'garmin_hrv',
    sleep: 'garmin_daily',
    steps: 'garmin_daily',
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(
      and(
        eq(healthSnapshots.userId, auth.userId),
        eq(healthSnapshots.type, snapshotTypeMap[typeParam]),
        gte(healthSnapshots.recordedAt, since)
      )
    )
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(200)

  await logPhiAccess({
    userId: auth.userId,
    actorId: auth.userId,
    action: 'view',
    resourceType: 'trend',
  })

  // Decrypt + extract the relevant metric value for this type
  const extractValue = getValueExtractor(typeParam)
  const points: Array<{ date: string; value: number }> = []

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as Record<string, unknown>
      const value = extractValue(payload)
      if (value !== null) {
        points.push({ date: row.recordedAt.toISOString().split('T')[0], value })
      }
    } catch {
      // Skip corrupted records — do not fail the entire request
    }
  }

  // Reverse to chronological order (was desc from DB)
  points.reverse()

  const result: TrendResult = {
    type: typeParam,
    days,
    points,
    movingAverage7:  computeMovingAverage(points, 7),
    movingAverage30: computeMovingAverage(points, 30),
    anomalies:       detectAnomalies(points),
    baseline:        computeBaseline(points),
  }

  return NextResponse.json(result)
}

// ---- Metric extractors ----

function getValueExtractor(type: TrendType): (payload: Record<string, unknown>) => number | null {
  const safe = (v: unknown): number | null =>
    typeof v === 'number' && isFinite(v) ? v : null

  switch (type) {
    case 'hr':    return p => safe(p['heartRateAvgBpm'])
    case 'hrv':   return p => safe(p['hrvRmssdMs'] ?? p['hrvLastNight'])
    case 'sleep': return p => safe(p['sleepDurationMinutes'])
    case 'steps': return p => safe(p['stepsTotal'])
  }
}

// ---- Statistics ----

function computeMovingAverage(
  points: Array<{ date: string; value: number }>,
  window: number
): Array<{ date: string; value: number }> {
  if (points.length < window) return []
  return points.slice(window - 1).map((_, idx) => {
    const slice = points.slice(idx, idx + window)
    const avg = slice.reduce((sum, p) => sum + p.value, 0) / slice.length
    return { date: points[idx + window - 1].date, value: Math.round(avg * 10) / 10 }
  })
}

function computeBaseline(points: Array<{ date: string; value: number }>): { mean: number; stdDev: number } | null {
  if (points.length < 3) return null
  const values = points.map(p => p.value)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return { mean: Math.round(mean * 10) / 10, stdDev: Math.round(Math.sqrt(variance) * 10) / 10 }
}

function detectAnomalies(
  points: Array<{ date: string; value: number }>
): Array<{ date: string; value: number; deviation: number }> {
  const baseline = computeBaseline(points)
  if (!baseline || baseline.stdDev === 0) return []

  return points
    .map(p => ({
      ...p,
      deviation: Math.abs(p.value - baseline.mean) / baseline.stdDev,
    }))
    .filter(p => p.deviation >= 2)  // 2 SD threshold
    .map(p => ({ date: p.date, value: p.value, deviation: Math.round(p.deviation * 100) / 100 }))
}
```

### 5.1 — Add `TrendResult` to `@chorum/health-types`

**Modify:** `packages/health-types/src/index.ts` — add:

```typescript
export interface TrendPoint {
  date: string
  value: number
}

export interface TrendAnomaly extends TrendPoint {
  deviation: number  // standard deviations from baseline mean
}

export interface TrendResult {
  type: string
  days: number
  points: TrendPoint[]
  movingAverage7: TrendPoint[]
  movingAverage30: TrendPoint[]
  anomalies: TrendAnomaly[]
  baseline: { mean: number; stdDev: number } | null
}
```

---

## Step 6: Garmin Sync Cron

**File:** `src/app/api/cron/health-garmin-sync/route.ts`

```typescript
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb } from '@/db/health'
import { garminSyncState } from '@/db/health-schema'
import { syncGarminForUser } from '@/lib/health/garmin-sync'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  // Protect with GARMIN_CRON_SECRET (Vercel cron sends Authorization header)
  const authHeader = req.headers.get('authorization')
  const secret = process.env.GARMIN_CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all users with Garmin connected (circuit state is checked inside syncGarminForUser)
  const users = await healthDb
    .select({ userId: garminSyncState.userId })
    .from(garminSyncState)

  const results = await Promise.allSettled(
    users.map(({ userId }) => syncGarminForUser(userId))
  )

  const summary = results.map((r, i) => ({
    userId: users[i].userId,
    status: r.status,
    ...(r.status === 'fulfilled' ? r.value : { error: (r.reason as Error)?.message }),
  }))

  const totalCreated = summary
    .filter(s => s.status === 'fulfilled')
    .reduce((sum, s) => sum + ((s as { snapshotsCreated?: number }).snapshotsCreated ?? 0), 0)

  console.log(`[health-garmin-sync] ${users.length} users, ${totalCreated} snapshots created`)

  return NextResponse.json({ ok: true, users: users.length, snapshotsCreated: totalCreated, summary })
}
```

---

## Step 7: Weekly Checkup Cron

**File:** `src/app/api/cron/health-checkup/route.ts`

```typescript
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { deidentifyObject } from '@/lib/health/deidentify'
import { callProvider } from '@/lib/providers'
import { db } from '@/db'
import { learnings, personas } from '@/db/schema'
import { eq, and, gte, desc } from 'drizzle-orm'

const CHECKUP_WINDOW_DAYS = 7

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.GARMIN_CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find users with health snapshots in the past 7 days
  const since = new Date(Date.now() - CHECKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const recentRows = await healthDb
    .selectDistinct({ userId: healthSnapshots.userId })
    .from(healthSnapshots)
    .where(gte(healthSnapshots.recordedAt, since))

  const healthPersona = await db
    .select()
    .from(personas)
    .where(and(eq(personas.name, 'Health Monitor'), eq(personas.isSystem, true)))
    .limit(1)

  if (healthPersona.length === 0) {
    console.error('[health-checkup] Health Monitor persona not found — was Phase 1 migration run?')
    return NextResponse.json({ error: 'Health Monitor persona not seeded' }, { status: 500 })
  }

  const persona = healthPersona[0]
  const results: Array<{ userId: string; status: string; anomalies?: number }> = []

  for (const { userId } of recentRows) {
    try {
      // Fetch recent snapshots
      const rows = await healthDb
        .select()
        .from(healthSnapshots)
        .where(and(eq(healthSnapshots.userId, userId), gte(healthSnapshots.recordedAt, since)))
        .orderBy(desc(healthSnapshots.recordedAt))
        .limit(50)

      await logPhiAccess({ userId, actorId: 'system', action: 'view', resourceType: 'snapshot' })

      // Decrypt + de-identify
      const deidentifiedPayloads: unknown[] = []
      for (const row of rows) {
        try {
          const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
          const clean = deidentifyObject({ type: row.type, source: row.source, data: raw })
          deidentifiedPayloads.push(clean)
        } catch { /* skip corrupted records */ }
      }

      if (deidentifiedPayloads.length === 0) {
        results.push({ userId, status: 'skipped:no_data' })
        continue
      }

      // Build prompt for Health Monitor persona
      const dataJson = JSON.stringify(deidentifiedPayloads, null, 2)
      const prompt = `Analyze the following de-identified health data from the past 7 days. Identify trends, anomalies, and any values outside normal reference ranges. Provide structured findings.\n\n${dataJson}`

      // Call the AI provider — use the system persona's preferred provider or fall back to default
      const analysisResult = await callProvider({
        userId,
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: persona.systemPrompt,
        temperature: 0.3,
        maxTokens: 1024,
      })

      const analysisText = typeof analysisResult === 'string'
        ? analysisResult
        : (analysisResult as { content?: string }).content ?? ''

      // Parse anomaly count from response (heuristic — look for flagged items)
      const anomalyMatches = analysisText.match(/anomal|flag|alert|out.of.range|elevated|low/gi)
      const anomalyCount = anomalyMatches?.length ?? 0

      // Create a health_alert learning if anomalies found
      if (anomalyCount > 0) {
        const learningHash = hashPHI({ userId, week: since.toISOString().split('T')[0], type: 'health_alert' })
        await db
          .insert(learnings)
          .values({
            userId,
            type: 'health_alert',
            content: `Weekly checkup flagged ${anomalyCount} potential anomalies. Review health dashboard.`,
            metadata: { source: 'health_checkup_cron', week: since.toISOString().split('T')[0] },
            contentHash: learningHash,
          })
          .onConflictDoNothing()
      }

      // Store checkup result as a snapshot for history
      const checkupPayload = {
        weekStarting: since.toISOString().split('T')[0],
        snapshotsAnalyzed: deidentifiedPayloads.length,
        anomaliesFound: anomalyCount,
        summaryNote: analysisText.substring(0, 500),  // truncated for storage
      }
      const encrypted = encryptPHI(checkupPayload)
      await healthDb.insert(healthSnapshots).values({
        userId,
        type: 'checkup_result',
        recordedAt: new Date(),
        source: 'system',
        encryptedPayload: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadHash: hashPHI(checkupPayload),
      })

      results.push({ userId, status: 'ok', anomalies: anomalyCount })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[health-checkup] Failed for user ${userId}: ${msg}`)
      results.push({ userId, status: `error:${msg}` })
    }
  }

  return NextResponse.json({ ok: true, processed: recentRows.length, results })
}
```

**Note on `callProvider()`:** The checkup cron calls `callProvider()` which requires a provider credential for the user. If the user has no provider configured, the call will fail gracefully. The cron will log the failure and continue to the next user. Phase 4 may add a system-level fallback provider for health analysis.

---

## Step 8: Update `health_checkup` MCP Handler

**File:** `src/lib/customization/health-handlers.ts`

Replace the Phase 2 `health_checkup` stub. Find the `health_checkup` handler and replace with full LLM analysis:

```typescript
// In the health_checkup handler case:
case 'health_checkup': {
  const { days = 7 } = (args ?? {}) as { days?: number }

  const since = new Date(Date.now() - Math.min(days, 30) * 24 * 60 * 60 * 1000)

  const rows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(and(eq(healthSnapshots.userId, userId), gte(healthSnapshots.recordedAt, since)))
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(30)

  await logPhiAccess({ userId, actorId: userId, action: 'view', resourceType: 'snapshot' })

  const payloads: unknown[] = []
  for (const row of rows) {
    try {
      const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
      payloads.push(deidentifyObject({ type: row.type, source: row.source, data: raw }))
    } catch { /* skip */ }
  }

  if (payloads.length === 0) {
    return { result: 'No health data found for the requested period.', snapshotsAnalyzed: 0 }
  }

  // Note: actual LLM call happens in the MCP route's outer provider call.
  // Return de-identified data structured for the Health Monitor persona to analyze.
  return {
    snapshotsAnalyzed: payloads.length,
    periodDays: days,
    deidentifiedData: payloads,
    instruction: 'Analyze the deidentifiedData above. Identify trends, flag anomalies vs reference ranges, and summarize findings concisely.',
  }
}
```

**Note on handler architecture:** MCP tool handlers run before the LLM call, not instead of it. The `health_checkup` handler enriches the context with de-identified health data. The Health Monitor persona (with its system prompt and low temperature) then analyzes that data in the same LLM call. This matches how `health_trends` enriches the context with computed trend data.

Add required imports to `health-handlers.ts`:
```typescript
import { deidentifyObject } from '@/lib/health/deidentify'
import { gte, desc } from 'drizzle-orm'
```

---

## Step 9: Update `vercel.json`

**File:** `chorum_v2/vercel.json`

Add to the `crons` array (alongside existing cron jobs):

```json
{ "path": "/api/cron/health-garmin-sync", "schedule": "0 */6 * * *" },
{ "path": "/api/cron/health-checkup", "schedule": "0 8 * * 1" }
```

> `0 8 * * 1` = Monday 8:00 AM UTC. If the user is in a US timezone, this is 1–4 AM local time — generally acceptable. The schedule can be adjusted in Vercel dashboard without code changes.

> Both crons are protected by `GARMIN_CRON_SECRET` via `Authorization: Bearer` header. Vercel automatically sends this header for cron invocations when `CRON_SECRET` is set in project settings. Map `GARMIN_CRON_SECRET` to the `CRON_SECRET` Vercel environment variable, or update the cron handlers to check `process.env.CRON_SECRET` instead.

---

## Step 10: Tests

### 10.1 — Garmin Transformer Tests

**File:** `src/__tests__/health/garmin-transformer.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { transformGarminDaily, transformGarminHRV } from '@/lib/health/garmin-transformer'

describe('transformGarminDaily', () => {
  it('extracts all fields from well-formed response', () => {
    const raw = {
      calendarDate: '2026-03-01',
      averageHeartRateInBeatsPerMinute: 68,
      restingHeartRateInBeatsPerMinute: 55,
      maxHeartRateInBeatsPerMinute: 142,
      totalSteps: 8432,
      activeKilocalories: 520,
      totalKilocalories: 2100,
      totalDistanceInMeters: 6200,
      sleepingSeconds: 25200,  // 420 min = 7h
      sleepScore: 82,
      averageStressLevel: 28,
      bodyBatteryMostRecentValue: 65,
    }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.date).toBe('2026-03-01')
    expect(result!.heartRateAvgBpm).toBe(68)
    expect(result!.sleepDurationMinutes).toBe(420)
    expect(result!.sleepScore).toBe(82)
  })

  it('handles alternate field names (API v2 shape)', () => {
    const raw = {
      startTimeLocal: '2026-03-01T00:00:00',
      averageHeartRate: 72,
      steps: 10000,
    }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBe(72)
    expect(result!.stepsTotal).toBe(10000)
  })

  it('unwraps dailySummary wrapper', () => {
    const raw = { dailySummary: { calendarDate: '2026-03-01', averageHeartRateInBeatsPerMinute: 65 } }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBe(65)
  })

  it('returns null when date is missing', () => {
    expect(transformGarminDaily({ averageHeartRateInBeatsPerMinute: 70 })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(transformGarminDaily(null)).toBeNull()
    expect(transformGarminDaily('string')).toBeNull()
    expect(transformGarminDaily(42)).toBeNull()
    expect(transformGarminDaily(undefined)).toBeNull()
  })

  it('handles missing optional fields gracefully (returns null for each)', () => {
    const result = transformGarminDaily({ calendarDate: '2026-03-01' })
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBeNull()
    expect(result!.sleepScore).toBeNull()
  })
})

describe('transformGarminHRV', () => {
  it('extracts HRV fields', () => {
    const raw = {
      hrvSummary: {
        calendarDate: '2026-03-01',
        weeklyAvg: 48,
        lastNight: 45,
        status: 'BALANCED',
      }
    }
    const result = transformGarminHRV(raw)
    expect(result).not.toBeNull()
    expect(result!.date).toBe('2026-03-01')
    expect(result!.hrvWeeklyAvg).toBe(48)
    expect(result!.hrvStatus).toBe('BALANCED')
  })

  it('returns null when all HRV values are absent', () => {
    const result = transformGarminHRV({ calendarDate: '2026-03-01' })
    expect(result).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(transformGarminHRV(null)).toBeNull()
  })
})
```

### 10.2 — De-identification Tests

**File:** `src/__tests__/health/deidentify.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { deidentify, deidentifyObject } from '@/lib/health/deidentify'

// 20 PHI strings that MUST be stripped
const PHI_CASES: Array<[string, string]> = [
  ['Patient: John Smith', 'Patient: [NAME]'],
  ['DOB: 03/15/1982', 'DOB: [DATE]'],
  ['DOB: March 15, 1982', 'DOB: [DATE]'],
  ['SSN: 123-45-6789', 'SSN: [SSN]'],
  ['Phone: (555) 867-5309', 'Phone: [PHONE]'],
  ['Phone: 555-867-5309', 'Phone: [PHONE]'],
  ['Email: jsmith@example.com', 'Email: [EMAIL]'],
  ['MRN: MRN: 00123456', 'MRN: [MRN]'],
  ['ZIP: 94103', 'ZIP: [ZIP]'],
  ['Member ID: 987654321012', 'Member [PLAN_ID]'],
  ['Account No. 4412882331', 'Account [ACCOUNT]'],
  ['IP: 192.168.1.100', 'IP: [IP]'],
  ['URL: https://mychart.health.org/results/123', 'URL: [URL]'],
  ['Patient name: Jane Doe', 'Patient name: [NAME]'],
  ['Physician: Robert Jones, MD', 'Physician: [NAME], MD'],
  ['Date of service: 01/05/2026', 'Date of service: [DATE]'],
  ['Admitted: 15 January 2026', 'Admitted: [DATE]'],
  ['Device ID: 1234567890', 'Device ID: [ID]'],
  ['Phone: +1 (800) 555-0100', 'Phone: [PHONE]'],
  ['License No. ABC123456', 'License [LICENSE]'],
]

// 20 clinical strings that MUST pass through unchanged
const CLINICAL_CASES = [
  'HR: 72 bpm',
  'HRV: 45 ms',
  'Resting HR: 58 bpm',
  'K+: 4.1 mEq/L',
  'Na+: 138 mEq/L',
  'Hemoglobin A1c: 5.4%',
  'LDL: 112 mg/dL',
  'HDL: 58 mg/dL',
  'Glucose: 94 mg/dL',
  'Creatinine: 0.9 mg/dL',
  'eGFR: 85 mL/min/1.73m2',
  'TSH: 2.1 mIU/L',
  'Steps: 8432',
  'Sleep: 7h 20min',
  'SpO2: 98%',
  'Weight: 78 kg',
  'BMI: 24.3',
  'Systolic BP: 118 mmHg',
  'Diastolic BP: 76 mmHg',
  'Temperature: 98.6 F',
]

describe('deidentify — PHI stripping', () => {
  it.each(PHI_CASES)('strips PHI: %s', (input, expected) => {
    // We check that the output does NOT contain the original sensitive portion
    // and DOES contain the replacement token. Exact match where unambiguous.
    const result = deidentify(input)
    expect(result).not.toBe(input)
    // At minimum: result must contain a bracket-wrapped token
    expect(result).toMatch(/\[.+?\]/)
  })
})

describe('deidentify — clinical values pass through', () => {
  it.each(CLINICAL_CASES)('preserves: %s', (clinical) => {
    expect(deidentify(clinical)).toBe(clinical)
  })
})

describe('deidentifyObject', () => {
  it('scrubs string values recursively', () => {
    const input = {
      patient: 'John Smith',
      metrics: {
        hr: 72,
        note: 'Reviewed by Dr. James Brown on 02/01/2026',
      },
      values: ['HR: 72 bpm', 'Contact: john@example.com'],
    }
    const result = deidentifyObject(input) as typeof input
    expect(result.patient).toContain('[NAME]')
    expect(result.metrics.note).toContain('[DATE]')
    expect(result.metrics.hr).toBe(72)  // numbers must pass through unchanged
    expect(result.values[0]).toBe('HR: 72 bpm')  // clinical value preserved
    expect(result.values[1]).toContain('[EMAIL]')
  })

  it('passes numbers through unchanged', () => {
    expect(deidentifyObject(72)).toBe(72)
    expect(deidentifyObject(4.1)).toBe(4.1)
  })

  it('handles null and undefined', () => {
    expect(deidentifyObject(null)).toBeNull()
    expect(deidentifyObject(undefined)).toBeUndefined()
  })
})
```

### 10.3 — Trends Tests

**File:** `src/__tests__/health/trends.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

// Import the pure stat functions directly — they need to be exported from trends route
// Refactor: extract to src/lib/health/trend-math.ts so tests can import them
import { computeMovingAverage, computeBaseline, detectAnomalies } from '@/lib/health/trend-math'
import type { TrendPoint } from '@chorum/health-types'

function makePoints(values: number[]): TrendPoint[] {
  return values.map((value, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    value,
  }))
}

describe('computeMovingAverage', () => {
  it('returns empty array when fewer points than window', () => {
    const points = makePoints([60, 62, 65])
    expect(computeMovingAverage(points, 7)).toEqual([])
  })

  it('computes correct 7-day moving average', () => {
    const points = makePoints([70, 72, 68, 74, 70, 72, 68, 70])
    const ma = computeMovingAverage(points, 7)
    expect(ma).toHaveLength(2)
    // First window: [70, 72, 68, 74, 70, 72, 68] = avg 70.57
    expect(ma[0].value).toBeCloseTo(70.6, 0)
  })

  it('length = points.length - window + 1', () => {
    const points = makePoints(Array.from({ length: 30 }, (_, i) => 65 + i % 10))
    expect(computeMovingAverage(points, 7)).toHaveLength(24)
    expect(computeMovingAverage(points, 30)).toHaveLength(1)
  })
})

describe('computeBaseline', () => {
  it('returns null for fewer than 3 points', () => {
    expect(computeBaseline(makePoints([70, 72]))).toBeNull()
  })

  it('computes mean and stdDev correctly', () => {
    const points = makePoints([70, 70, 70, 70, 70])
    const baseline = computeBaseline(points)
    expect(baseline).not.toBeNull()
    expect(baseline!.mean).toBe(70)
    expect(baseline!.stdDev).toBe(0)
  })

  it('detects variance', () => {
    const points = makePoints([60, 70, 80])
    const baseline = computeBaseline(points)
    expect(baseline!.mean).toBeCloseTo(70, 0)
    expect(baseline!.stdDev).toBeGreaterThan(0)
  })
})

describe('detectAnomalies', () => {
  it('flags values >= 2 SD from mean', () => {
    // mean=70, stdDev≈0 for 29 values of 70; then one value of 200 = extreme anomaly
    const points = makePoints([...Array(29).fill(70), 200])
    const anomalies = detectAnomalies(points)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].value).toBe(200)
    expect(anomalies[0].deviation).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array for uniform data', () => {
    const points = makePoints(Array(20).fill(70))
    expect(detectAnomalies(points)).toEqual([])
  })

  it('returns empty array for fewer than 3 points', () => {
    const points = makePoints([60, 200])
    expect(detectAnomalies(points)).toEqual([])
  })
})
```

> **Important:** The test file imports from `@/lib/health/trend-math`. You must refactor the pure stat functions (`computeMovingAverage`, `computeBaseline`, `detectAnomalies`) out of `trends/route.ts` into `src/lib/health/trend-math.ts` so they are importable by tests. Export them from `trend-math.ts`; import them into the route. This is the only acceptable way to test these functions — do not use HTTP mocking for pure math.

---

## Validation Checklist — Phase 3

Run through every item before marking Phase 3 complete.

### Garmin Integration
- [ ] `POST /api/health/garmin/connect` with valid test credentials → `{ ok: true }`, encrypted row in `garmin_sync_state`
- [ ] `POST /api/health/garmin/connect` with invalid credentials → HTTP 422, no row written
- [ ] `DELETE /api/health/garmin/connect` → row removed
- [ ] `POST /api/health/garmin/sync` → `snapshotsCreated >= 1` for a user with connected Garmin
- [ ] Plaintext username/password NEVER appears in `garmin_sync_state` rows
- [ ] `credsIv` field is non-empty and different for every stored credential pair

### Circuit Breaker
- [ ] Three consecutive sync failures set `circuit_open = true` and `circuit_opened_at` timestamp
- [ ] While circuit is open, sync returns immediately with `"Circuit breaker open"` error
- [ ] Set `circuit_opened_at` to 25 hours ago → next sync auto-resets circuit, attempts Garmin call

### Trends
- [ ] `GET /api/health/trends?type=hr&days=30` returns `points`, `movingAverage7`, `anomalies`, `baseline`
- [ ] 7-day moving average length = `points.length - 6` (for datasets with 7+ points)
- [ ] Inject a synthetic HR value 3 SD above mean → `anomalies` array contains that date
- [ ] `phi_audit_log` has a `view` entry after each trends request

### De-identification
- [ ] All 20 PHI test cases produce output containing bracket tokens (no raw PHI survives)
- [ ] All 20 clinical test cases pass through `deidentify()` unchanged
- [ ] `deidentifyObject({ hr: 72, note: 'John Smith DOB 03/15/1982' })` → `hr` is still `72`, `note` contains `[NAME]` and `[DATE]`
- [ ] `deidentify("K+: 4.1 mEq/L")` === `"K+: 4.1 mEq/L"` — no false positive on lab value

### Crons
- [ ] `GET /api/cron/health-garmin-sync` without correct `Authorization` header → HTTP 403
- [ ] `GET /api/cron/health-garmin-sync` with correct secret → processes users, returns `{ ok: true }`
- [ ] `GET /api/cron/health-checkup` produces `checkup_result` snapshot in health DB for test user
- [ ] Weekly checkup creates `health_alert` learning when anomalies detected
- [ ] Checkup LLM call uses de-identified data — verify no names/dates in the prompt by logging once (then remove the log)

### `health_checkup` MCP Tool
- [ ] Call `health_checkup` tool via `/api/mcp` with a valid session → returns `deidentifiedData` array and `instruction` field
- [ ] Response is NOT the Phase 2 stub (no `note: "Excluded text document types"` in the response)
- [ ] PHI audit log records `view` entry for the MCP call

### `vercel.json`
- [ ] `vercel.json` contains both new cron paths
- [ ] Cron schedules are valid cron expressions: `0 */6 * * *` and `0 8 * * 1`

---

## Architecture Notes

### Why `garmin-sync.ts` is shared, not duplicated

The sync logic is extracted to `src/lib/health/garmin-sync.ts` so both the cron (`/api/cron/health-garmin-sync`) and the on-demand endpoint (`/api/health/garmin/sync`) share a single implementation. The cron processes all users; the on-demand endpoint processes only the authenticated user. No sync logic lives in either route file.

### `callProvider()` in the checkup cron

The weekly checkup uses `callProvider()` from the existing provider factory. This means the checkup uses the user's own configured provider (OpenAI, Anthropic, etc.). If no provider is configured, the checkup is skipped for that user — this is logged but not an error. A system-level fallback provider (shared API key) is a Phase 6 consideration.

### De-identification is one-directional

`deidentify()` must never be applied to data that will be stored — only to data that will be sent to an LLM. The stored `health_snapshots` always contain the original encrypted payload. De-identification is applied at the boundary before external calls, never at rest.
