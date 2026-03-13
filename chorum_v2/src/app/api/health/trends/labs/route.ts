// src/app/api/health/trends/labs/route.ts
// Trends a named lab marker across all stored 'labs' snapshots.
// Equivalent to GET /api/health/trends for Garmin metrics, but for lab values.
//
// Query params:
//   marker (required) — e.g. "LDL-C", "Hemoglobin A1c", "K+"
//   days   (optional) — limit to last N days; default 0 = all time
//
// Returns TrendResult shape (same as Garmin trends) so web/mobile chart
// components can render lab trends with the same code path.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate }              from '@/lib/customization/auth'
import { healthDb }                  from '@/db/health'
import { healthSnapshots }           from '@/db/health-schema'
import { decryptPHI }                from '@/lib/health/crypto'
import { logPhiAccess }              from '@/lib/health/audit'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import {
  computeMovingAverage,
  computeBaseline,
  detectAnomalies,
} from '@/lib/health/trend-math'
import { eq, and, gte, desc }        from 'drizzle-orm'
import type { TrendPoint }           from '@chorum/health-types'

interface LabValue {
  name:  string
  value: number | null
  unit:  string
  flag?: string | null
  referenceMin?: number | null
  referenceMax?: number | null
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
  const marker = searchParams.get('marker')?.trim()
  const days   = Math.max(0, parseInt(searchParams.get('days') ?? '0', 10))

  if (!marker) {
    return NextResponse.json({ error: 'marker query parameter required (e.g. "LDL-C")' }, { status: 400 })
  }

  const since = days > 0
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : new Date(0)

  const whereClause = days > 0
    ? and(eq(healthSnapshots.userId, auth.userId), eq(healthSnapshots.type, 'labs'), gte(healthSnapshots.recordedAt, since))
    : and(eq(healthSnapshots.userId, auth.userId), eq(healthSnapshots.type, 'labs'))

  const rows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(whereClause)
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(500)

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'view', resourceType: 'trend' })

  const points: TrendPoint[] = []
  const markerLower = marker.toLowerCase()

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as Record<string, unknown>
      const values  = Array.isArray(payload['values']) ? payload['values'] as LabValue[] : []

      // Case-insensitive match on name field
      const match = values.find(v => v.name?.toLowerCase() === markerLower)
      if (match && typeof match.value === 'number') {
        const date = row.recordedAt.toISOString().split('T')[0]!
        points.push({ date, value: match.value })
      }
    } catch { /* skip corrupted */ }
  }

  points.reverse()  // chronological

  // Find unit and reference range from the most recent occurrence
  let unit = ''
  let referenceMin: number | null = null
  let referenceMax: number | null = null

  for (const row of rows) {
    try {
      const payload = decryptPHI(row.encryptedPayload, row.payloadIv) as Record<string, unknown>
      const values  = Array.isArray(payload['values']) ? payload['values'] as LabValue[] : []
      const match   = values.find(v => v.name?.toLowerCase() === markerLower)
      if (match) {
        unit         = match.unit ?? ''
        referenceMin = match.referenceMin ?? null
        referenceMax = match.referenceMax ?? null
        break
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({
    marker,
    unit,
    referenceMin,
    referenceMax,
    days:            days === 0 ? null : days,
    points,
    movingAverage7:  computeMovingAverage(points, 7),
    movingAverage30: computeMovingAverage(points, 30),
    anomalies:       detectAnomalies(points),
    baseline:        computeBaseline(points),
  })
}
