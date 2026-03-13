export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'

import { healthDb } from '@/db/health'
import { verifyBatch } from '@/lib/health/integrity'

const SAMPLE_RATE = 0.2
const MAX_PER_RUN = 500

type IntegrityRow = {
  id: string
  user_id: string
  encrypted_payload: string
  payload_iv: string
  payload_hash: string
}

export async function POST(req: NextRequest) {
  const secret = process.env.HEALTH_INTEGRITY_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('authorization')
  const authorized = Boolean(secret) && (
    headerSecret === secret ||
    authHeader === `Bearer ${secret}`
  )
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const samplePct = SAMPLE_RATE * 100
  const rows = await healthDb.execute(
    sql`SELECT id, user_id, encrypted_payload, payload_iv, payload_hash
        FROM health_snapshots
        TABLESAMPLE BERNOULLI(${samplePct})
        LIMIT ${MAX_PER_RUN}`,
  ) as unknown as IntegrityRow[]

  if (rows.length === 0) {
    return NextResponse.json({ checked: 0, passed: 0, failed: 0, failures: [] })
  }

  const byUser = new Map<string, IntegrityRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? []
    list.push(row)
    byUser.set(row.user_id, list)
  }

  let totalPassed = 0
  let totalFailed = 0
  const failures: Array<{ snapshotId: string; reason?: string }> = []

  for (const [userId, userRows] of byUser) {
    const result = await verifyBatch(
      userRows.map((row) => ({
        id: row.id,
        encryptedPayload: row.encrypted_payload,
        payloadIv: row.payload_iv,
        payloadHash: row.payload_hash,
      })),
      userId,
    )

    totalPassed += result.passed
    totalFailed += result.failed
    failures.push(...result.failures.map((f) => ({
      snapshotId: f.snapshotId,
      ...(f.reason ? { reason: f.reason } : {}),
    })))
  }

  return NextResponse.json({
    checked: rows.length,
    passed: totalPassed,
    failed: totalFailed,
    failures,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
