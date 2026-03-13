export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const secret = process.env.HEALTH_RECEIPTS_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('authorization')
  const authorized = Boolean(secret) && (
    headerSecret === secret ||
    authHeader === `Bearer ${secret}`
  )
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Phase 6 scaffold: receipt ticket persistence is not implemented yet.
  // Cron is added now so infrastructure is deployed and callable.
  return NextResponse.json({
    message: 'Receipt check scheduled - ticket store not yet implemented',
    checked: 0,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
