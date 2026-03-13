export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { healthUserSettings } from '@/db/health-schema'
import type { AlertThresholds } from '@/lib/health/alert-evaluator'

function parseThresholds(raw: string | null): AlertThresholds | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as AlertThresholds : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await healthDb
    .select({ alertThresholds: healthUserSettings.alertThresholds })
    .from(healthUserSettings)
    .where(eq(healthUserSettings.userId, auth.userId))
    .limit(1)

  return NextResponse.json({
    alertThresholds: parseThresholds(row?.alertThresholds ?? null),
  })
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

  const thresholds = (body as { alertThresholds?: unknown }).alertThresholds
  if (thresholds !== null && (typeof thresholds !== 'object' || Array.isArray(thresholds))) {
    return NextResponse.json({ error: 'alertThresholds must be an object or null' }, { status: 400 })
  }

  const encoded = thresholds === null
    ? null
    : JSON.stringify(thresholds as Record<string, unknown>)

  await healthDb
    .insert(healthUserSettings)
    .values({
      userId: auth.userId,
      alertThresholds: encoded,
    })
    .onConflictDoUpdate({
      target: healthUserSettings.userId,
      set: {
        alertThresholds: encoded,
        updatedAt: new Date(),
      },
    })

  return NextResponse.json({
    alertThresholds: thresholds ?? null,
  })
}
