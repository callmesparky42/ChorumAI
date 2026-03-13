// Checks Expo push receipts and deactivates dead tokens.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'

import { healthDb } from '@/db/health'
import { pushTokens } from '@/db/health-schema'

interface ExpoReceiptResponse {
  data: Record<string, {
    status: 'ok' | 'error'
    message?: string
    details?: { error?: string }
  }>
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.HEALTH_RECEIPTS_SECRET || secret !== process.env.HEALTH_RECEIPTS_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const receiptIds = (body as { receiptIds?: unknown }).receiptIds
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
    return NextResponse.json({ checked: 0, deactivated: 0 })
  }

  const ids = receiptIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (ids.length === 0) {
    return NextResponse.json({ checked: 0, deactivated: 0 })
  }

  const BATCH = 300
  const deadTokenIds: string[] = []

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch }),
    })
    if (!response.ok) continue

    const { data } = await response.json() as ExpoReceiptResponse
    for (const [receiptId, receipt] of Object.entries(data)) {
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        // Phase 6 scaffold: receiptId->token mapping is not stored yet.
        deadTokenIds.push(receiptId)
      }
    }
  }

  if (deadTokenIds.length === 0) {
    return NextResponse.json({ checked: ids.length, deactivated: 0 })
  }

  await healthDb
    .update(pushTokens)
    .set({ active: false })
    .where(inArray(pushTokens.token, deadTokenIds))

  return NextResponse.json({ checked: ids.length, deactivated: deadTokenIds.length })
}
