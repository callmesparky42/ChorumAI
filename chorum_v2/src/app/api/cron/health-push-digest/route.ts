export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'

import { healthDb } from '@/db/health'
import { healthSnapshots, pushTokens } from '@/db/health-schema'
import { decryptPHI } from '@/lib/health/crypto'

function authorized(req: NextRequest): boolean {
  const secret = process.env.HEALTH_PUSH_DIGEST_SECRET
  if (!secret) return false

  const authHeader = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return authHeader === `Bearer ${secret}` || cronSecret === secret
}

function appBaseUrl(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return null
}

function summarizeCheckup(payload: Record<string, unknown>): string {
  const fromSummaryNote = typeof payload.summaryNote === 'string' ? payload.summaryNote.trim() : ''
  const fromSummary = typeof payload.summary === 'string' ? payload.summary.trim() : ''
  const source = fromSummaryNote || fromSummary

  if (!source) return 'Your weekly health summary is ready.'

  const firstSentence = source
    .split(/[.!?]\s+/)[0]
    ?.replace(/\s+/g, ' ')
    .trim() ?? ''

  if (!firstSentence) return 'Your weekly health summary is ready.'
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}...` : firstSentence
}

async function runDigest(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const baseUrl = appBaseUrl()
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL or VERCEL_URL must be set for digest dispatch' },
      { status: 500 },
    )
  }

  const tokenRows = await healthDb
    .selectDistinct({ userId: pushTokens.userId })
    .from(pushTokens)
    .where(eq(pushTokens.active, true))

  const userIds = tokenRows.map((row) => row.userId)
  if (userIds.length === 0) return NextResponse.json({ sent: 0, failed: 0 })

  const settled = await Promise.allSettled(
    userIds.map(async (userId) => {
      const [checkupRow] = await healthDb
        .select({
          encryptedPayload: healthSnapshots.encryptedPayload,
          payloadIv: healthSnapshots.payloadIv,
        })
        .from(healthSnapshots)
        .where(and(
          eq(healthSnapshots.userId, userId),
          eq(healthSnapshots.type, 'checkup_result'),
        ))
        .orderBy(desc(healthSnapshots.recordedAt))
        .limit(1)

      if (!checkupRow) return 0

      let body = 'Your weekly health summary is ready.'
      try {
        const payload = decryptPHI(checkupRow.encryptedPayload, checkupRow.payloadIv) as Record<string, unknown>
        body = summarizeCheckup(payload)
      } catch {
        body = 'Your weekly health summary is ready.'
      }

      const response = await fetch(`${baseUrl}/api/health/push/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.GARMIN_CRON_SECRET ?? '',
        },
        body: JSON.stringify({
          userId,
          title: 'Chorum Health Weekly Summary',
          body,
          data: { screen: 'dashboard', kind: 'weekly_digest' },
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`notify failed: ${response.status} ${text}`)
      }

      const payload = await response.json() as { sent?: number }
      return typeof payload.sent === 'number' ? payload.sent : 0
    }),
  )

  const sent = settled
    .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
    .reduce((sum, result) => sum + result.value, 0)
  const failed = settled.filter((result) => result.status === 'rejected').length

  return NextResponse.json({ sent, failed })
}

export async function GET(req: NextRequest) {
  return runDigest(req)
}

export async function POST(req: NextRequest) {
  return runDigest(req)
}
