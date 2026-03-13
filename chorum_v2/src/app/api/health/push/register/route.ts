export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { pushTokens } from '@/db/health-schema'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'

const RegisterSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']).default('android'),
})

const UnregisterSchema = z.object({
  token: z.string().min(1),
})

function isExpoToken(token: string): boolean {
  return /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(token)
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'push:register')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { token, platform } = parsed.data
  if (!isExpoToken(token)) {
    return NextResponse.json({ error: 'Invalid Expo push token format' }, { status: 400 })
  }

  await healthDb
    .insert(pushTokens)
    .values({
      userId: auth.userId,
      token,
      platform,
      active: true,
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: {
        userId: auth.userId,
        platform,
        active: true,
      },
    })

  return NextResponse.json({ registered: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'push:register')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = UnregisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  await healthDb
    .update(pushTokens)
    .set({ active: false })
    .where(and(
      eq(pushTokens.userId, auth.userId),
      eq(pushTokens.token, parsed.data.token),
    ))

  return NextResponse.json({ unregistered: true })
}
