// Internal endpoint for cron/system-triggered push delivery.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { healthDb } from '@/db/health'
import { pushTokens } from '@/db/health-schema'

interface ExpoTicket {
  status?: 'ok' | 'error'
  details?: { error?: string }
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default'
}

const NotifySchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).optional(),
})

function chunkMessages(messages: ExpoPushMessage[], size = 100): ExpoPushMessage[][] {
  const chunks: ExpoPushMessage[][] = []
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size))
  }
  return chunks
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoTicket[]> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  })

  if (!response.ok) {
    throw new Error(`Expo push failed: ${response.status}`)
  }

  const json = await response.json() as { data?: ExpoTicket[] }
  return json.data ?? []
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.GARMIN_CRON_SECRET || secret !== process.env.GARMIN_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = NotifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { userId, title, body: messageBody, data } = parsed.data
  const tokenRows = await healthDb
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(and(
      eq(pushTokens.userId, userId),
      eq(pushTokens.active, true),
    ))

  if (tokenRows.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: 'no_active_tokens' })
  }

  const messages: ExpoPushMessage[] = tokenRows.map((row) => ({
    to: row.token,
    title,
    body: messageBody,
    sound: 'default',
    ...(data ? { data } : {}),
  }))

  let sent = 0
  let failed = 0
  const deactivateTokens: string[] = []

  try {
    for (const chunk of chunkMessages(messages)) {
      const tickets = await sendExpoPush(chunk)
      if (tickets.length === 0) {
        sent += chunk.length
        continue
      }

      for (let i = 0; i < chunk.length; i += 1) {
        const ticket = tickets[i]
        if (!ticket || ticket.status === 'ok') {
          sent += 1
          continue
        }

        failed += 1
        if (ticket.details?.error === 'DeviceNotRegistered') {
          deactivateTokens.push(chunk[i]!.to)
        }
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Push send failed' },
      { status: 502 },
    )
  }

  if (deactivateTokens.length > 0) {
    await healthDb
      .update(pushTokens)
      .set({ active: false })
      .where(and(
        eq(pushTokens.userId, userId),
        inArray(pushTokens.token, deactivateTokens),
      ))
  }

  return NextResponse.json({ sent, failed })
}
