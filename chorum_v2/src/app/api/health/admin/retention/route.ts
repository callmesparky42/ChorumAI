export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { healthUserSettings } from '@/db/health-schema'
import { logPhiAccess } from '@/lib/health/audit'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await healthDb
    .select({ retentionDays: healthUserSettings.retentionDays })
    .from(healthUserSettings)
    .where(eq(healthUserSettings.userId, auth.userId))
    .limit(1)

  return NextResponse.json({ retentionDays: row?.retentionDays ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const retentionDays = (body as { retentionDays?: unknown }).retentionDays
  if (
    typeof retentionDays !== 'number' ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 0 ||
    retentionDays > 3650
  ) {
    return NextResponse.json(
      { error: 'retentionDays must be an integer 0-3650 (0 = retain forever)' },
      { status: 400 },
    )
  }

  await healthDb
    .insert(healthUserSettings)
    .values({
      userId: auth.userId,
      retentionDays,
    })
    .onConflictDoUpdate({
      target: healthUserSettings.userId,
      set: {
        retentionDays,
        updatedAt: new Date(),
      },
    })

  await logPhiAccess({
    userId: auth.userId,
    actorId: auth.userId,
    action: 'view',
    resourceType: 'snapshot',
  })

  return NextResponse.json({ retentionDays })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await healthDb.execute(
    sql`DELETE FROM health_snapshots WHERE user_id = ${auth.userId}`,
  ) as unknown as { rowCount?: number }

  await logPhiAccess({
    userId: auth.userId,
    actorId: auth.userId,
    action: 'delete',
    resourceType: 'snapshot',
  })

  return NextResponse.json({ deleted: result.rowCount ?? 0 })
}
