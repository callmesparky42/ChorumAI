export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { logPhiAccess } from '@/lib/health/audit'
import { decryptPHI } from '@/lib/health/crypto'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { computeMovingAverage, computeBaseline, detectAnomalies } from '@/lib/health/trend-math'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import { eq, and, gte, desc } from 'drizzle-orm'
import type { TrendPoint, TrendResult } from '@chorum/health-types'

const VALID_TYPES = ['hr', 'hrv', 'sleep', 'steps'] as const
type TrendType = typeof VALID_TYPES[number]

function isValidType(v: string): v is TrendType {
  return (VALID_TYPES as readonly string[]).includes(v)
}

const SNAPSHOT_TYPE_MAP: Record<TrendType, string> = {
  hr:    'garmin_daily',
  hrv:   'garmin_hrv',
  sleep: 'garmin_daily',
  steps: 'garmin_daily',
}

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

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'trends')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const { searchParams } = new URL(req.url)
  const typeParam = searchParams.get('type') ?? 'hr'
  const daysParam = parseInt(searchParams.get('days') ?? '30', 10)
  const days = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 7), 90)

  if (!isValidType(typeParam)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(
      and(
        eq(healthSnapshots.userId, auth.userId),
        eq(healthSnapshots.type, SNAPSHOT_TYPE_MAP[typeParam]),
        gte(healthSnapshots.recordedAt, since)
      )
    )
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(200)

  await logPhiAccess({
    userId:       auth.userId,
    actorId:      auth.userId,
    action:       'view',
    resourceType: 'trend',
  })

  const extractValue = getValueExtractor(typeParam)
  const points: TrendPoint[] = []

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as Record<string, unknown>
      const value   = extractValue(payload)
      if (value !== null) {
        points.push({ date: row.recordedAt.toISOString().slice(0, 10), value })
      }
    } catch {
      // Skip corrupted records — do not fail the entire request
    }
  }

  // Reverse from newest-first (DB order) to chronological
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
