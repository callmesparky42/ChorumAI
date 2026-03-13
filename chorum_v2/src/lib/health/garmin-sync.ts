// src/lib/health/garmin-sync.ts
// Core Garmin sync logic — shared by the cron and on-demand route.
// Handles credential decrypt, API fetch, circuit breaker, and snapshot creation.

import { healthDb } from '@/db/health'
import { garminSyncState, healthSnapshots } from '@/db/health-schema'
import { encryptPHI, decryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { transformGarminDaily, transformGarminHRV } from '@/lib/health/garmin-transformer'
import { eq, and } from 'drizzle-orm'

// garmin-connect has no TypeScript declarations — use require + minimal interface
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GarminConnect } = require('garmin-connect') as {
  GarminConnect: new () => GarminConnectClient
}

interface GarminConnectClient {
  login(username: string, password: string): Promise<unknown>
  getUserProfile(): Promise<unknown>
  getDailySummary(date: string): Promise<unknown>
  getHRV(date: string): Promise<unknown>
}

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_RESET_HOURS       = 24

export interface GarminSyncResult {
  userId:            string
  snapshotsCreated:  number
  skippedDuplicates: number
  error?:            string
}

// ---------------------------------------------------------------------------
// Public: sync one user
// ---------------------------------------------------------------------------

export async function syncGarminForUser(userId: string): Promise<GarminSyncResult> {
  const rows = await healthDb
    .select()
    .from(garminSyncState)
    .where(eq(garminSyncState.userId, userId))
    .limit(1)

  if (rows.length === 0) {
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: 'No Garmin credentials found' }
  }

  const state = rows[0]!

  // Circuit breaker — open circuit short-circuits with no API call
  if (state.circuitOpen) {
    const resetCutoff = new Date(Date.now() - CIRCUIT_RESET_HOURS * 60 * 60 * 1000)
    if (state.circuitOpenedAt && state.circuitOpenedAt > resetCutoff) {
      return {
        userId,
        snapshotsCreated:  0,
        skippedDuplicates: 0,
        error:             'Circuit breaker open — Garmin sync suspended (resets after 24h)',
      }
    }
    // Auto-reset: enough time has passed since the circuit opened
    await healthDb
      .update(garminSyncState)
      .set({ circuitOpen: false, circuitOpenedAt: null, consecutiveFailures: 0, updatedAt: new Date() })
      .where(eq(garminSyncState.userId, userId))
  }

  // Decrypt credentials
  // credsIv format: 'usernameIv:passwordIv'
  let username: string, password: string
  try {
    const [usernameIv, passwordIv] = state.credsIv.split(':')
    const usernameParsed = decryptPHI(state.encryptedUsername, usernameIv!) as { value: string }
    const passwordParsed = decryptPHI(state.encryptedPassword, passwordIv!) as { value: string }
    username = usernameParsed.value
    password = passwordParsed.value
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Credential decrypt failed'
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: msg }
  }

  // Fetch from Garmin
  let dailyRaw: unknown
  let hrvRaw: unknown
  const syncDate = state.syncCursor ?? new Date().toISOString().split('T')[0]!

  try {
    const client = new GarminConnect()
    await client.login(username, password)

    dailyRaw = await client.getDailySummary(syncDate)
    hrvRaw   = await client.getHRV(syncDate)

    // Success — reset failure counter, advance cursor to today
    const today = new Date().toISOString().split('T')[0]!
    await healthDb
      .update(garminSyncState)
      .set({ consecutiveFailures: 0, lastSyncAt: new Date(), syncCursor: today, updatedAt: new Date() })
      .where(eq(garminSyncState.userId, userId))
  } catch (err) {
    const newFailures = (state.consecutiveFailures ?? 0) + 1
    const openCircuit = newFailures >= CIRCUIT_FAILURE_THRESHOLD

    await healthDb
      .update(garminSyncState)
      .set({
        consecutiveFailures: newFailures,
        circuitOpen:         openCircuit,
        circuitOpenedAt:     openCircuit ? new Date() : state.circuitOpenedAt,
        updatedAt:           new Date(),
      })
      .where(eq(garminSyncState.userId, userId))

    const msg = err instanceof Error ? err.message : 'Unknown Garmin API error'
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: msg }
  }

  // Transform + store snapshots
  let created = 0
  let skipped = 0

  const daily = transformGarminDaily(dailyRaw)
  if (daily) {
    const r = await storeSnapshot(userId, 'garmin_daily', daily)
    r ? created++ : skipped++
  }

  const hrv = transformGarminHRV(hrvRaw)
  if (hrv) {
    const r = await storeSnapshot(userId, 'garmin_hrv', hrv)
    r ? created++ : skipped++
  }

  return { userId, snapshotsCreated: created, skippedDuplicates: skipped }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Encrypt and persist a snapshot. Returns true if created, false if duplicate.
 */
async function storeSnapshot(userId: string, type: string, payload: unknown): Promise<boolean> {
  const hash = hashPHI(payload)

  // Dedup check — unique index enforces this too, but checking first avoids a write
  const existing = await healthDb
    .select({ id: healthSnapshots.id })
    .from(healthSnapshots)
    .where(and(eq(healthSnapshots.userId, userId), eq(healthSnapshots.payloadHash, hash)))
    .limit(1)

  if (existing.length > 0) return false

  const encrypted = encryptPHI(payload)

  await healthDb.insert(healthSnapshots).values({
    userId,
    type,
    recordedAt:       new Date(),
    source:           'garmin',
    encryptedPayload: encrypted.ciphertext,
    payloadIv:        encrypted.iv,
    payloadHash:      hash,
  })

  await logPhiAccess({
    userId,
    actorId:      userId,
    action:       'create',
    resourceType: 'snapshot',
  })

  return true
}
