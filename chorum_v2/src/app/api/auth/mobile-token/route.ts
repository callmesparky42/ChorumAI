export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'

import { authenticate } from '@/lib/customization/auth'
import { createNebula } from '@/lib/nebula'

// DELETE: revoke the current bearer token (used for logout / lost device handling).
export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawToken = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!rawToken) return NextResponse.json({ error: 'No token' }, { status: 400 })

  const nebula = createNebula()
  const tokenRecord = await nebula.validateApiToken(rawToken)

  if (!tokenRecord || tokenRecord.userId !== auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await nebula.revokeApiToken(tokenRecord.id)
  return NextResponse.json({ revoked: true })
}
