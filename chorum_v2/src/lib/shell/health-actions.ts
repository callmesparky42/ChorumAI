'use server'

import crypto from 'node:crypto'
import { getServerSession } from 'next-auth/next'
import { createClient } from '@supabase/supabase-js'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { authOptions } from '@/lib/auth'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { ConversionError, convertTiffToPng } from '@/lib/health/tiff'
import type {
  ConfirmUploadResponse,
  GarminDailyPayload,
  GarminHRVPayload,
  HealthDashboardData,
  HealthPayload,
  HealthSnapshotSource,
  HealthSnapshotType,
  LatestVitalValue,
  LatestVitals,
  PresignUploadResponse,
  SnapshotSummary,
  VitalSignsPayload,
} from '@chorum/health-types'

const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'
const MAX_UPLOAD_BYTES = 52_428_800
const MAX_SIGNED_KEYS = 20
const DASHBOARD_WINDOW_DAYS = 14
const INITIAL_TIMELINE_LIMIT = 20

const allowedMimeTypes = new Set([
  'image/tiff',
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/csv',
  'application/octet-stream',
])

function emptyVitals(): LatestVitals {
  return {
    restingHR: null,
    avgHRV: null,
    steps: null,
    sleepScore: null,
    systolicBP: null,
    diastolicBP: null,
    lastSnapshotAt: null,
  }
}

function emptyDashboardData(): HealthDashboardData {
  return {
    vitals: emptyVitals(),
    hrChart: [],
    hrvChart: [],
    sleepChart: [],
    stepsChart: [],
    recentSnapshots: [],
    totalSnapshots: 0,
  }
}

function asRecord(payload: HealthPayload): Record<string, unknown> {
  return payload as Record<string, unknown>
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function payloadDate(payload: Record<string, unknown>, fallback: Date): string {
  const candidate = typeof payload.date === 'string'
    ? payload.date
    : typeof payload.recordedAt === 'string'
      ? payload.recordedAt.slice(0, 10)
      : null
  return candidate ?? fallback.toISOString().slice(0, 10)
}

async function getAuthenticatedUserId(): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    return DEV_USER_ID
  }
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user.id
}

function getHealthStorageClient() {
  const url = process.env.HEALTH_SUPABASE_URL
  const key = process.env.HEALTH_SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('Missing health storage environment configuration.')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function toLatest(value: number | null, unit: string, recordedAt: Date): LatestVitalValue | null {
  if (value === null) return null
  return { value, unit, recordedAt: recordedAt.toISOString() }
}

function buildVitals(
  rows: Array<{
    type: string
    recordedAt: Date
    encryptedPayload: string
    payloadIv: string
  }>,
): LatestVitals {
  const vitals = emptyVitals()

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as HealthPayload
      const raw = asRecord(payload)

      if (row.type === 'garmin_daily') {
        if (!vitals.restingHR) {
          vitals.restingHR = toLatest(
            asNumber(raw.heartRateRestingBpm ?? raw.restingHR),
            'bpm',
            row.recordedAt,
          )
        }
        if (!vitals.steps) {
          vitals.steps = toLatest(
            asNumber(raw.stepsTotal ?? raw.steps),
            'steps',
            row.recordedAt,
          )
        }
        if (!vitals.sleepScore) {
          vitals.sleepScore = toLatest(
            asNumber(raw.sleepScore),
            '/100',
            row.recordedAt,
          )
        }
      }

      if (row.type === 'garmin_hrv' && !vitals.avgHRV) {
        vitals.avgHRV = toLatest(
          asNumber(raw.hrvRmssdMs ?? raw.avgHRV),
          'ms',
          row.recordedAt,
        )
      }

      if (row.type === 'vitals') {
        if (!vitals.systolicBP) {
          vitals.systolicBP = toLatest(asNumber(raw.systolicBP), 'mmHg', row.recordedAt)
        }
        if (!vitals.diastolicBP) {
          vitals.diastolicBP = toLatest(asNumber(raw.diastolicBP), 'mmHg', row.recordedAt)
        }
      }
    } catch {
      // Skip undecryptable rows
    }
  }

  vitals.lastSnapshotAt = rows[0]?.recordedAt.toISOString() ?? null
  return vitals
}

function buildCharts(
  rows: Array<{
    type: string
    recordedAt: Date
    encryptedPayload: string
    payloadIv: string
  }>,
): Pick<HealthDashboardData, 'hrChart' | 'hrvChart' | 'sleepChart' | 'stepsChart'> {
  const hrChart: HealthDashboardData['hrChart'] = []
  const hrvChart: HealthDashboardData['hrvChart'] = []
  const sleepChart: HealthDashboardData['sleepChart'] = []
  const stepsChart: HealthDashboardData['stepsChart'] = []

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as HealthPayload
      const raw = asRecord(payload)
      const date = payloadDate(raw, row.recordedAt)

      if (row.type === 'garmin_daily') {
        const avgHR = asNumber(raw.heartRateAvgBpm ?? raw.avgHR)
        const restingHR = asNumber(raw.heartRateRestingBpm ?? raw.restingHR)
        const maxHR = asNumber(raw.heartRateMaxBpm ?? raw.maxHR)
        const steps = asNumber(raw.stepsTotal ?? raw.steps)
        const sleepDuration = asNumber(raw.sleepDurationMinutes)

        if (avgHR !== null && restingHR !== null && maxHR !== null) {
          hrChart.push({ date, avgHR, restingHR, maxHR })
        }
        if (steps !== null) {
          stepsChart.push({ date, steps, goal: 10_000 })
        }
        if (sleepDuration !== null) {
          sleepChart.push({
            date,
            deepMinutes: asNumber(raw.deepMinutes) ?? 0,
            remMinutes: asNumber(raw.remMinutes) ?? 0,
            lightMinutes: asNumber(raw.lightMinutes) ?? sleepDuration,
            awakeMinutes: asNumber(raw.awakeMinutes) ?? 0,
          })
        }
      }

      if (row.type === 'garmin_hrv') {
        const avgHRV = asNumber(raw.hrvRmssdMs ?? raw.avgHRV)
        if (avgHRV !== null) {
          hrvChart.push({
            date,
            avgHRV,
            sdnn: asNumber(raw.sdnn),
          })
        }
      }
    } catch {
      // Skip undecryptable rows
    }
  }

  const byDateAsc = <T extends { date: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.date.localeCompare(b.date))

  return {
    hrChart: byDateAsc(hrChart),
    hrvChart: byDateAsc(hrvChart),
    sleepChart: byDateAsc(sleepChart),
    stepsChart: byDateAsc(stepsChart),
  }
}

function parseStoragePages(storagePath: string | null): string[] {
  if (!storagePath) return []
  try {
    const parsed = JSON.parse(storagePath) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string')
  } catch {
    return []
  }
}

function computeSnapshotSummary(
  type: HealthSnapshotType,
  payload: HealthPayload,
): { summary: string; flagCount: number } {
  const raw = asRecord(payload)

  if (type === 'garmin_daily') {
    const resting = asNumber(raw.heartRateRestingBpm ?? raw.restingHR)
    const steps = asNumber(raw.stepsTotal ?? raw.steps)
    return {
      summary: `HR: ${resting ?? '—'} bpm resting · ${(steps ?? 0).toLocaleString()} steps`,
      flagCount: 0,
    }
  }

  if (type === 'garmin_hrv') {
    const hrv = asNumber(raw.hrvRmssdMs ?? raw.avgHRV)
    return { summary: `HRV: ${hrv ?? '—'} ms avg`, flagCount: 0 }
  }

  if (type === 'labs') {
    const results = Array.isArray(raw.results)
      ? raw.results
      : Array.isArray(raw.values)
        ? raw.values
        : []
    const flaggedCount = results.filter((item) => {
      const entry = item as Record<string, unknown>
      return entry.flag !== null && entry.flag !== undefined
    }).length
    return {
      summary: `${results.length} tests · ${flaggedCount} flagged`,
      flagCount: flaggedCount,
    }
  }

  if (type === 'icd_report') {
    const battery = asNumber(raw.batteryPct)
    const nsvt = asNumber(raw.nsVtEpisodes)
    const svt = asNumber(raw.svtEpisodes)
    return {
      summary: `Battery: ${battery ?? '—'}% · ${nsvt ?? 0} NSVTs · ${svt ?? 0} SVTs`,
      flagCount: 0,
    }
  }

  if (type === 'vitals') {
    const systolic = asNumber(raw.systolicBP)
    const diastolic = asNumber(raw.diastolicBP)
    const hr = asNumber(raw.heartRate)
    return {
      summary: `BP: ${systolic ?? '—'}/${diastolic ?? '—'} mmHg · HR: ${hr ?? '—'} bpm`,
      flagCount: 0,
    }
  }

  if (type === 'mychart') {
    return { summary: 'MyChart document', flagCount: 0 }
  }

  if (type === 'ocr_document') {
    const parsedCount = raw.parsedFields && typeof raw.parsedFields === 'object'
      ? Object.keys(raw.parsedFields as Record<string, unknown>).length
      : 0
    return { summary: `Scanned document — ${parsedCount} fields parsed`, flagCount: 0 }
  }

  return { summary: 'Health snapshot', flagCount: 0 }
}

async function createSnapshotRecord(
  userId: string,
  type: HealthSnapshotType,
  recordedAt: string,
  source: HealthSnapshotSource,
  payload: Record<string, unknown>,
  storagePath: string | null,
): Promise<{ id: string; created: boolean }> {
  const payloadHash = hashPHI(payload)
  const existing = await healthDb
    .select({ id: healthSnapshots.id })
    .from(healthSnapshots)
    .where(and(
      eq(healthSnapshots.userId, userId),
      eq(healthSnapshots.payloadHash, payloadHash),
    ))
    .limit(1)

  if (existing.length > 0) {
    return { id: existing[0]!.id, created: false }
  }

  const encrypted = encryptPHI(payload)
  const inserted = await healthDb
    .insert(healthSnapshots)
    .values({
      userId,
      type,
      recordedAt: new Date(recordedAt),
      source,
      encryptedPayload: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadHash,
      storagePath,
    })
    .returning({ id: healthSnapshots.id })

  return { id: inserted[0]!.id, created: true }
}

export async function getSignedReadUrls(storageKeys: string[]): Promise<Record<string, string>> {
  if (storageKeys.length === 0) return {}
  if (storageKeys.length > MAX_SIGNED_KEYS) {
    throw new Error(`A maximum of ${MAX_SIGNED_KEYS} storage keys is allowed per call.`)
  }

  try {
    const storage = getHealthStorageClient().storage.from('health-uploads')
    const results = await Promise.all(storageKeys.map(async (key) => {
      const { data, error } = await storage.createSignedUrl(key, 3600)
      if (error || !data?.signedUrl) return null
      return [key, data.signedUrl] as const
    }))
    return Object.fromEntries(results.filter((entry): entry is readonly [string, string] => entry !== null))
  } catch {
    return {}
  }
}

export async function getHealthDashboardData(): Promise<HealthDashboardData> {
  try {
    const userId = await getAuthenticatedUserId()
    const since = new Date(Date.now() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const [windowRows, recentRows, totalResult] = await Promise.all([
      healthDb
        .select()
        .from(healthSnapshots)
        .where(and(
          eq(healthSnapshots.userId, userId),
          gte(healthSnapshots.recordedAt, since),
        ))
        .orderBy(desc(healthSnapshots.recordedAt))
        .limit(500),
      healthDb
        .select()
        .from(healthSnapshots)
        .where(eq(healthSnapshots.userId, userId))
        .orderBy(desc(healthSnapshots.recordedAt))
        .limit(INITIAL_TIMELINE_LIMIT),
      healthDb
        .select({ count: sql<number>`count(*)` })
        .from(healthSnapshots)
        .where(eq(healthSnapshots.userId, userId)),
    ])

    const totalSnapshots = Number(totalResult[0]?.count ?? 0)

    const summariesRaw: Array<SnapshotSummary & { storagePages: string[] }> = []
    for (const row of recentRows) {
      try {
        const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as HealthPayload
        const { summary, flagCount } = computeSnapshotSummary(row.type as HealthSnapshotType, payload)
        summariesRaw.push({
          id: row.id,
          type: row.type as HealthSnapshotType,
          source: row.source as HealthSnapshotSource,
          recordedAt: row.recordedAt.toISOString(),
          summary,
          storagePath: row.storagePath,
          tiffPageUrls: null,
          flagCount,
          storagePages: parseStoragePages(row.storagePath),
        })
      } catch {
        // Skip undecryptable rows
      }
    }

    const icdToSign = summariesRaw
      .filter((s) => s.type === 'icd_report' && s.storagePages.length > 0)
      .slice(0, 5)
      .flatMap((s) => s.storagePages)

    const signedMap = await getSignedReadUrls(icdToSign)
    const recentSnapshots: SnapshotSummary[] = summariesRaw.map((summary) => ({
      id: summary.id,
      type: summary.type,
      source: summary.source,
      recordedAt: summary.recordedAt,
      summary: summary.summary,
      storagePath: summary.storagePath,
      tiffPageUrls: summary.storagePages.length > 0
        ? summary.storagePages.map((key) => signedMap[key]).filter((url): url is string => typeof url === 'string')
        : null,
      flagCount: summary.flagCount,
    }))

    const vitals = buildVitals(windowRows)
    const charts = buildCharts(windowRows)

    void logPhiAccess({
      userId,
      actorId: userId,
      action: 'view',
      resourceType: 'report',
    })

    return {
      vitals,
      hrChart: charts.hrChart,
      hrvChart: charts.hrvChart,
      sleepChart: charts.sleepChart,
      stepsChart: charts.stepsChart,
      recentSnapshots,
      totalSnapshots,
    }
  } catch {
    return emptyDashboardData()
  }
}

export async function getSnapshotPage(
  offset: number,
  limit = INITIAL_TIMELINE_LIMIT,
): Promise<{ snapshots: SnapshotSummary[]; total: number }> {
  const userId = await getAuthenticatedUserId()
  const safeOffset = Math.max(0, offset)
  const safeLimit = Math.min(Math.max(1, limit), 100)

  const [rows, totalResult] = await Promise.all([
    healthDb
      .select()
      .from(healthSnapshots)
      .where(eq(healthSnapshots.userId, userId))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(safeLimit)
      .offset(safeOffset),
    healthDb
      .select({ count: sql<number>`count(*)` })
      .from(healthSnapshots)
      .where(eq(healthSnapshots.userId, userId)),
  ])

  const snapshots: SnapshotSummary[] = []
  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as HealthPayload
      const { summary, flagCount } = computeSnapshotSummary(row.type as HealthSnapshotType, payload)
      snapshots.push({
        id: row.id,
        type: row.type as HealthSnapshotType,
        source: row.source as HealthSnapshotSource,
        recordedAt: row.recordedAt.toISOString(),
        summary,
        storagePath: row.storagePath,
        tiffPageUrls: null,
        flagCount,
      })
    } catch {
      // Skip undecryptable rows
    }
  }

  void logPhiAccess({
    userId,
    actorId: userId,
    action: 'view',
    resourceType: 'snapshot',
  })

  return {
    snapshots,
    total: Number(totalResult[0]?.count ?? 0),
  }
}

function extensionFromMime(contentType: string): string {
  switch (contentType) {
    case 'image/tiff':
      return 'tiff'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'application/pdf':
      return 'pdf'
    case 'text/csv':
      return 'csv'
    case 'application/octet-stream':
      return 'fit'
    default:
      return 'bin'
  }
}

export async function presignHealthUpload(
  filename: string,
  contentType: string,
  fileSizeBytes: number,
): Promise<PresignUploadResponse> {
  const userId = await getAuthenticatedUserId()
  if (!filename.trim()) {
    throw new Error('filename is required')
  }
  if (!allowedMimeTypes.has(contentType)) {
    throw new Error('unsupported_type')
  }
  if (fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error('file_too_large')
  }

  const storageKey = `health-uploads/${userId}/${crypto.randomUUID()}.${extensionFromMime(contentType)}`
  const storage = getHealthStorageClient().storage.from('health-uploads')
  const { data, error } = await storage.createSignedUploadUrl(storageKey, { upsert: false })
  if (error || !data?.signedUrl) {
    throw new Error('Upload setup failed')
  }

  return {
    uploadUrl: data.signedUrl,
    storageKey,
  }
}

function isTiffPath(storageKey: string): boolean {
  return /\.tiff?$/i.test(storageKey)
}

function buildUploadPayload(
  type: HealthSnapshotType,
  metadata: Record<string, unknown> | undefined,
  tiffPages: string[],
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) }
  if (type === 'icd_report' && tiffPages.length > 0) {
    return { ...base, storagePages: tiffPages }
  }
  return Object.keys(base).length > 0 ? base : { uploaded: true }
}

export async function confirmHealthUpload(
  storageKey: string,
  type: HealthSnapshotType,
  recordedAt: string,
  source: HealthSnapshotSource,
  metadata?: Record<string, unknown>,
): Promise<ConfirmUploadResponse> {
  const userId = await getAuthenticatedUserId()
  if (!storageKey.startsWith(`health-uploads/${userId}/`)) {
    throw new Error('forbidden_storage_key')
  }

  let tiffPages: string[] = []
  let tiffError = false
  let storagePath: string | null = storageKey

  if (isTiffPath(storageKey)) {
    try {
      tiffPages = await convertTiffToPng(storageKey, userId)
      storagePath = tiffPages.length > 0 ? JSON.stringify(tiffPages) : null
    } catch (err: unknown) {
      if (err instanceof ConversionError && err.message === 'TIFF exceeds 50 pages') {
        throw err
      }
      tiffError = true
      storagePath = null
      tiffPages = []
    }
  }

  const payload = buildUploadPayload(type, metadata, tiffPages)
  const snapshot = await createSnapshotRecord(userId, type, recordedAt, source, payload, storagePath)

  void logPhiAccess({
    userId,
    actorId: userId,
    action: 'create',
    resourceType: 'snapshot',
    resourceId: snapshot.id,
  })

  return {
    snapshotId: snapshot.id,
    tiffPages: tiffPages.length > 0 ? tiffPages : undefined,
    tiffError: tiffError ? true : undefined,
  }
}
