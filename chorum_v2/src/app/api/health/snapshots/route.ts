export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import type {
  CreateSnapshotResponse,
  HealthSnapshotSource,
  HealthSnapshotType,
  HealthSnapshotWithPayload,
  ListSnapshotsResponse,
} from '@chorum/health-types'

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

const listQuerySchema = z.object({
  type: z.enum(snapshotTypes).optional(),
  source: z.enum(snapshotSources).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

function getClientIp(request: NextRequest): string | undefined {
  const raw = request.headers.get('x-forwarded-for')
  if (!raw) return undefined
  return raw.split(',')[0]?.trim()
}

async function createSnapshot(
  userId: string,
  data: {
    type: HealthSnapshotType
    recordedAt: string
    source: HealthSnapshotSource
    payload: Record<string, unknown>
    storagePath?: string | undefined
  },
): Promise<CreateSnapshotResponse> {
  const payloadHash = hashPHI(data.payload)

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

  const encrypted = encryptPHI(data.payload)
  const inserted = await healthDb
    .insert(healthSnapshots)
    .values({
      userId,
      type: data.type,
      recordedAt: new Date(data.recordedAt),
      source: data.source,
      encryptedPayload: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadHash,
      storagePath: data.storagePath ?? null,
    })
    .returning({ id: healthSnapshots.id })

  return { id: inserted[0]!.id, created: true }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimit(auth.userId, 'snapshots:write')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'validation', fields: ['body'] }, { status: 400 })
  }

  const parsed = createSnapshotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      },
      { status: 400 },
    )
  }

  try {
    const result = await createSnapshot(auth.userId, parsed.data)
    const ipAddress = getClientIp(request)
    void logPhiAccess({
      userId: auth.userId,
      actorId: auth.userId,
      action: 'create',
      resourceType: 'snapshot',
      resourceId: result.id,
      ...(ipAddress ? { ipAddress } : {}),
    })

    return NextResponse.json(
      result,
      { status: result.created ? 201 : 200 },
    )
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rl = await checkRateLimit(auth.userId, 'snapshots:read')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    type: url.searchParams.get('type') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    fromDate: url.searchParams.get('fromDate') ?? undefined,
    toDate: url.searchParams.get('toDate') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      },
      { status: 400 },
    )
  }

  const query = parsed.data
  const limit = query.limit ?? 50
  const offset = query.offset ?? 0

  let whereClause = eq(healthSnapshots.userId, auth.userId)
  if (query.type) {
    whereClause = and(whereClause, eq(healthSnapshots.type, query.type))!
  }
  if (query.source) {
    whereClause = and(whereClause, eq(healthSnapshots.source, query.source))!
  }
  if (query.fromDate) {
    whereClause = and(
      whereClause,
      gte(healthSnapshots.recordedAt, new Date(`${query.fromDate}T00:00:00.000Z`)),
    )!
  }
  if (query.toDate) {
    whereClause = and(
      whereClause,
      lte(healthSnapshots.recordedAt, new Date(`${query.toDate}T23:59:59.999Z`)),
    )!
  }

  const rows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(whereClause)
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(limit)
    .offset(offset)

  const snapshots: HealthSnapshotWithPayload[] = []
  let failedCount = 0

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv)
      snapshots.push({
        id: row.id,
        userId: row.userId,
        type: row.type as HealthSnapshotType,
        recordedAt: row.recordedAt.toISOString(),
        source: row.source as HealthSnapshotSource,
        payloadHash: row.payloadHash,
        storagePath: row.storagePath,
        createdAt: row.createdAt.toISOString(),
        payload: payload as HealthSnapshotWithPayload['payload'],
      })
    } catch {
      failedCount += 1
    }
  }

  const ipAddress = getClientIp(request)
  void logPhiAccess({
    userId: auth.userId,
    actorId: auth.userId,
    action: 'view',
    resourceType: 'snapshot',
    ...(ipAddress ? { ipAddress } : {}),
  })

  const response: ListSnapshotsResponse = {
    snapshots,
    total: snapshots.length + failedCount,
    failedCount,
  }

  return NextResponse.json(response)
}
