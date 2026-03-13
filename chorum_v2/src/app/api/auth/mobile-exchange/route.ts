export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'

import { db } from '@/db'
import { mobileAuthCodes } from '@/db/schema'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const code = (
    body &&
    typeof body === 'object' &&
    typeof (body as Record<string, unknown>)['code'] === 'string'
  )
    ? (body as { code: string }).code
    : null

  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 })
  }

  const [row] = await db
    .select()
    .from(mobileAuthCodes)
    .where(and(
      eq(mobileAuthCodes.code, code),
      eq(mobileAuthCodes.used, false),
      gt(mobileAuthCodes.expiresAt, new Date()),
    ))
    .limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  await db
    .update(mobileAuthCodes)
    .set({ used: true })
    .where(eq(mobileAuthCodes.code, code))

  return NextResponse.json({ token: row.token })
}
