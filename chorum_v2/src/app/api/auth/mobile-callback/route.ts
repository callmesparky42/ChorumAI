export const runtime = 'nodejs'

import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { createNebula } from '@/lib/nebula'
import { db } from '@/db'
import { mobileAuthCodes } from '@/db/schema'

const TOKEN_TTL_DAYS = 90
const CODE_TTL_MS = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url))
  }

  const nebula = createNebula()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS)

  const { token } = await nebula.createApiToken({
    userId: session.user.id,
    name: `mobile-${new Date().toISOString().split('T')[0]!}`,
    scopes: ['read:nebula', 'write:nebula', 'read:health', 'write:health'],
    expiresAt,
  })

  const code = crypto.randomBytes(24).toString('hex')
  const codeExpiry = new Date(Date.now() + CODE_TTL_MS)

  await db.insert(mobileAuthCodes).values({
    code,
    token,
    expiresAt: codeExpiry,
  })

  const deepLink = `chorum://auth?code=${code}`
  return NextResponse.redirect(deepLink)
}
