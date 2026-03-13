export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { syncGarminForUser } from '@/lib/health/garmin-sync'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'garmin:sync')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const result = await syncGarminForUser(auth.userId)

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
  }

  return NextResponse.json({
    ok:                true,
    snapshotsCreated:  result.snapshotsCreated,
    skippedDuplicates: result.skippedDuplicates,
  })
}
