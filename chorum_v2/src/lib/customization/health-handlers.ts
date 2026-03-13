import { and, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'

import { healthDb } from '@/db/health'
import { healthSources, healthSnapshots } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { deidentifyObject } from '@/lib/health/deidentify'
import { checkRateLimit } from '@/lib/health/rate-limit'
import type { AuthContext } from './types'
import type { CreateSnapshotRequest, HealthSnapshotType } from '@chorum/health-types'

export class HealthMcpError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message)
    this.name = 'HealthMcpError'
  }
}

type MCPToolResult = {
  content: Array<{ type: 'text'; text: string }>
}

const snapshotTypes = [
  'garmin_daily',
  'garmin_hrv',
  'labs',
  'icd_report',
  'vitals',
  'mychart',
  'checkup_result',
  'ocr_document',
] as const

const snapshotSources = [
  'garmin',
  'health_connect',
  'ocr',
  'manual',
  'mychart',
  'file_upload',
  'system',
] as const

const createSnapshotSchema = z.object({
  type: z.enum(snapshotTypes),
  recordedAt: z.string().datetime({ offset: true }),
  source: z.enum(snapshotSources),
  payload: z.record(z.string(), z.unknown()),
  storagePath: z.string().optional(),
})

const trendsParamsSchema = z.object({
  type: z.enum(snapshotTypes),
  days: z.number().int().min(1).max(90),
})

const sourcesParamsSchema = z.object({
  query: z.string().trim().min(1),
  domain: z.string().trim().min(1).optional(),
})

const checkupParamsSchema = z.object({
  days: z.number().int().min(1).max(30).optional(),
})

function toTextResult(data: unknown): MCPToolResult {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
  }
}

function asRecord(payload: object): Record<string, unknown> {
  return payload as Record<string, unknown>
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((acc, value) => acc + value, 0)
  return Number((sum / values.length).toFixed(1))
}

async function createSnapshot(
  userId: string,
  snapshot: CreateSnapshotRequest,
): Promise<{ id: string; created: boolean }> {
  const payloadHash = hashPHI(snapshot.payload)
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

  const encrypted = encryptPHI(snapshot.payload)
  const inserted = await healthDb
    .insert(healthSnapshots)
    .values({
      userId,
      type: snapshot.type,
      recordedAt: new Date(snapshot.recordedAt),
      source: snapshot.source,
      encryptedPayload: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadHash,
      storagePath: snapshot.storagePath ?? null,
    })
    .returning({ id: healthSnapshots.id })

  return { id: inserted[0]!.id, created: true }
}

function periodRange(days: number): { since: Date; label: string } {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const end = new Date()
  return {
    since,
    label: `${since.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
  }
}

export async function handleHealthSnapshot(
  params: unknown,
  auth: AuthContext,
): Promise<MCPToolResult> {
  const parsed = createSnapshotSchema.safeParse(params)
  if (!parsed.success) {
    throw new HealthMcpError(-32602, 'Invalid params')
  }

  try {
    const snapshot: CreateSnapshotRequest = {
      type: parsed.data.type,
      recordedAt: parsed.data.recordedAt,
      source: parsed.data.source,
      payload: parsed.data.payload,
      ...(parsed.data.storagePath ? { storagePath: parsed.data.storagePath } : {}),
    }
    const result = await createSnapshot(auth.userId, snapshot)
    void logPhiAccess({
      userId: auth.userId,
      actorId: auth.userId,
      action: 'create',
      resourceType: 'snapshot',
      resourceId: result.id,
    })

    return toTextResult(`Snapshot stored. ID: ${result.id}. Duplicate: ${!result.created}`)
  } catch {
    throw new HealthMcpError(-32603, 'Health data unavailable')
  }
}

export async function handleHealthTrends(
  params: unknown,
  auth: AuthContext,
): Promise<MCPToolResult> {
  const parsed = trendsParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new HealthMcpError(-32602, 'days must be between 1 and 90')
  }

  const { type, days } = parsed.data
  const { since, label } = periodRange(days)

  try {
    const rows = await healthDb
      .select()
      .from(healthSnapshots)
      .where(and(
        eq(healthSnapshots.userId, auth.userId),
        eq(healthSnapshots.type, type),
        gte(healthSnapshots.recordedAt, since),
      ))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(500)

    if (rows.length === 0) {
      return toTextResult({
        type,
        count: 0,
        message: `No ${type} data in the last ${days} days.`,
      })
    }

    const restingValues: number[] = []
    const stepValues: number[] = []
    const sleepScoreValues: number[] = []
    const hrvValues: number[] = []

    for (const row of rows) {
      try {
        const payload = asRecord(decryptPHI(row.encryptedPayload, row.payloadIv))
        if (type === 'garmin_daily') {
          const resting = asNumber(payload.heartRateRestingBpm ?? payload.restingHR)
          const steps = asNumber(payload.stepsTotal ?? payload.steps)
          const sleepScore = asNumber(payload.sleepScore)
          if (resting !== null) restingValues.push(resting)
          if (steps !== null) stepValues.push(steps)
          if (sleepScore !== null) sleepScoreValues.push(sleepScore)
        }
        if (type === 'garmin_hrv') {
          const hrv = asNumber(payload.hrvRmssdMs ?? payload.avgHRV)
          if (hrv !== null) hrvValues.push(hrv)
        }
      } catch {
        // Skip undecryptable rows
      }
    }

    void logPhiAccess({
      userId: auth.userId,
      actorId: auth.userId,
      action: 'view',
      resourceType: 'trend',
    })

    const summary: Record<string, unknown> = {
      type,
      period: label,
      count: rows.length,
    }

    if (type === 'garmin_daily') {
      summary.restingHR = {
        min: restingValues.length > 0 ? Math.min(...restingValues) : null,
        max: restingValues.length > 0 ? Math.max(...restingValues) : null,
        avg: average(restingValues),
      }
      summary.steps = {
        min: stepValues.length > 0 ? Math.min(...stepValues) : null,
        max: stepValues.length > 0 ? Math.max(...stepValues) : null,
        avg: average(stepValues),
      }
      summary.sleepScore = {
        avg: average(sleepScoreValues),
      }
    } else if (type === 'garmin_hrv') {
      summary.avgHRV = {
        min: hrvValues.length > 0 ? Math.min(...hrvValues) : null,
        max: hrvValues.length > 0 ? Math.max(...hrvValues) : null,
        avg: average(hrvValues),
      }
    }

    return toTextResult(summary)
  } catch (error) {
    if (error instanceof HealthMcpError) throw error
    throw new HealthMcpError(-32603, 'Health data unavailable')
  }
}

export async function handleHealthSources(
  params: unknown,
  _auth: AuthContext,
): Promise<MCPToolResult> {
  const rl = await checkRateLimit('mcp', 'sources')
  if (!rl.allowed) {
    throw new HealthMcpError(-32029, 'Rate limit exceeded')
  }

  const parsed = sourcesParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new HealthMcpError(-32602, 'Invalid params')
  }

  try {
    const baseWhere = parsed.data.domain
      ? and(eq(healthSources.active, true), eq(healthSources.domain, parsed.data.domain))
      : eq(healthSources.active, true)

    const rows = await healthDb
      .select({
        name: healthSources.name,
        url: healthSources.baseUrl,
        domain: healthSources.domain,
      })
      .from(healthSources)
      .where(baseWhere)

    const query = parsed.data.query.toLowerCase()
    const filtered = rows
      .filter((row) => row.name.toLowerCase().includes(query) || row.domain.toLowerCase().includes(query))
      .slice(0, 5)

    return toTextResult(filtered)
  } catch {
    throw new HealthMcpError(-32603, 'Health data unavailable')
  }
}

export async function handleHealthCheckup(
  params: unknown,
  auth: AuthContext,
): Promise<MCPToolResult> {
  const parsed = checkupParamsSchema.safeParse(params)
  if (!parsed.success) {
    throw new HealthMcpError(-32602, 'Invalid params')
  }

  const days = Math.min(parsed.data.days ?? 7, 30)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const rows = await healthDb
      .select()
      .from(healthSnapshots)
      .where(and(
        eq(healthSnapshots.userId, auth.userId),
        gte(healthSnapshots.recordedAt, since),
      ))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(30)

    void logPhiAccess({
      userId: auth.userId,
      actorId: auth.userId,
      action: 'view',
      resourceType: 'snapshot',
    })

    const payloads: unknown[] = []
    for (const row of rows) {
      try {
        const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
        payloads.push(deidentifyObject({ type: row.type, source: row.source, data: raw }))
      } catch {
        // Skip undecryptable rows
      }
    }

    if (payloads.length === 0) {
      return toTextResult({
        result: 'No health data found for the requested period.',
        snapshotsAnalyzed: 0,
      })
    }

    return toTextResult({
      snapshotsAnalyzed: payloads.length,
      periodDays: days,
      deidentifiedData: payloads,
      instruction: 'Analyze the deidentifiedData above. Identify trends, flag anomalies vs reference ranges, and summarize findings concisely.',
    })
  } catch (error) {
    if (error instanceof HealthMcpError) throw error
    throw new HealthMcpError(-32603, 'Health data unavailable')
  }
}
