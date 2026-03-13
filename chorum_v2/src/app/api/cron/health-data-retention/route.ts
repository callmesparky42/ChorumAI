export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { gt, sql } from 'drizzle-orm'

import { healthDb } from '@/db/health'
import { healthUserSettings } from '@/db/health-schema'
import { logPhiAccess } from '@/lib/health/audit'

export async function POST(req: NextRequest) {
  const secret = process.env.HEALTH_RETENTION_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('authorization')
  const authorized = Boolean(secret) && (
    headerSecret === secret ||
    authHeader === `Bearer ${secret}`
  )
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const users = await healthDb
    .select({
      userId: healthUserSettings.userId,
      retentionDays: healthUserSettings.retentionDays,
    })
    .from(healthUserSettings)
    .where(gt(healthUserSettings.retentionDays, 0))

  if (users.length === 0) {
    return NextResponse.json({ processed: 0, totalDeleted: 0, failed: 0 })
  }

  const settled = await Promise.allSettled(
    users.map(async ({ userId, retentionDays }) => {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
      const result = await healthDb.execute(
        sql`DELETE FROM health_snapshots
            WHERE user_id = ${userId}
              AND recorded_at < ${cutoff}`,
      ) as unknown as { rowCount?: number }

      const deleted = result.rowCount ?? 0
      if (deleted > 0) {
        await logPhiAccess({
          userId,
          actorId: 'system',
          action: 'delete',
          resourceType: 'snapshot',
        })
      }
      return deleted
    }),
  )

  const totalDeleted = settled
    .filter((item): item is PromiseFulfilledResult<number> => item.status === 'fulfilled')
    .reduce((sum, item) => sum + item.value, 0)
  const failed = settled.filter((item) => item.status === 'rejected').length

  return NextResponse.json({
    processed: users.length,
    totalDeleted,
    failed,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
