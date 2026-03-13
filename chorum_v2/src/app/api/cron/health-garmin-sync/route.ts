export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb } from '@/db/health'
import { garminSyncState } from '@/db/health-schema'
import { syncGarminForUser } from '@/lib/health/garmin-sync'

export async function GET(req: NextRequest) {
  // Protect with GARMIN_CRON_SECRET — Vercel sends this as Authorization header on cron invocations
  const authHeader = req.headers.get('authorization')
  const secret     = process.env.GARMIN_CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all users with Garmin connected
  const users = await healthDb
    .select({ userId: garminSyncState.userId })
    .from(garminSyncState)

  if (users.length === 0) {
    return NextResponse.json({ ok: true, users: 0, snapshotsCreated: 0, summary: [] })
  }

  // Process all users; Promise.allSettled ensures one failure doesn't block others
  const settled = await Promise.allSettled(
    users.map(({ userId }) => syncGarminForUser(userId))
  )

  const summary = settled.map((r, i) => {
    const userId = users[i]!.userId
    if (r.status === 'fulfilled') return r.value
    return { userId, snapshotsCreated: 0, skippedDuplicates: 0, error: (r.reason as Error)?.message ?? 'Unknown' }
  })

  const totalCreated = summary.reduce((sum, s) => sum + (s.snapshotsCreated ?? 0), 0)

  console.log(`[health-garmin-sync] ${users.length} users processed, ${totalCreated} snapshots created`)

  return NextResponse.json({ ok: true, users: users.length, snapshotsCreated: totalCreated, summary })
}
