export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { encryptPHI } from '@/lib/health/crypto'
import { healthDb } from '@/db/health'
import { garminSyncState } from '@/db/health-schema'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import { eq } from 'drizzle-orm'

// garmin-connect has no TypeScript declarations
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GarminConnect } = require('garmin-connect') as {
  GarminConnect: new () => { login(u: string, p: string): Promise<unknown>; getUserProfile(): Promise<unknown> }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = auth.userId

  const rl = await checkRateLimit(userId, 'garmin:connect')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    !body || typeof body !== 'object' ||
    typeof (body as Record<string, unknown>)['username'] !== 'string' ||
    typeof (body as Record<string, unknown>)['password'] !== 'string'
  ) {
    return NextResponse.json({ error: 'username and password are required' }, { status: 400 })
  }

  const { username, password } = body as { username: string; password: string }

  // Validate credentials before storing — attempt a live Garmin API call
  try {
    const client = new GarminConnect()
    await client.login(username, password)
    await client.getUserProfile()
  } catch {
    return NextResponse.json(
      { error: 'Garmin login failed. Check your credentials and try again.' },
      { status: 422 }
    )
  }

  // Encrypt credentials separately so each has its own IV
  const encUser = encryptPHI({ value: username })
  const encPass = encryptPHI({ value: password })

  // credsIv format: 'usernameIv:passwordIv'
  const credsIv = `${encUser.iv}:${encPass.iv}`

  await healthDb
    .insert(garminSyncState)
    .values({
      userId,
      encryptedUsername:   encUser.ciphertext,
      encryptedPassword:   encPass.ciphertext,
      credsIv,
      consecutiveFailures: 0,
      circuitOpen:         false,
    })
    .onConflictDoUpdate({
      target: garminSyncState.userId,
      set: {
        encryptedUsername:   encUser.ciphertext,
        encryptedPassword:   encPass.ciphertext,
        credsIv,
        consecutiveFailures: 0,
        circuitOpen:         false,
        circuitOpenedAt:     null,
        updatedAt:           new Date(),
      },
    })

  return NextResponse.json({ ok: true, message: 'Garmin credentials stored and verified.' })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'garmin:connect')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  await healthDb
    .delete(garminSyncState)
    .where(eq(garminSyncState.userId, auth.userId))

  return NextResponse.json({ ok: true })
}
