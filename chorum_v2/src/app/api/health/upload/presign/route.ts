export const runtime = 'nodejs'

import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

import { authenticate } from '@/lib/customization/auth'
import type { PresignUploadResponse } from '@chorum/health-types'

const MAX_BYTES = 52_428_800
const allowedMimeTypes = new Set([
  'image/tiff',
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/csv',
  'application/octet-stream',
])

const requestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
})

function extensionFromMime(contentType: string): string {
  switch (contentType) {
    case 'image/tiff':
      return 'tiff'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'application/pdf':
      return 'pdf'
    case 'text/csv':
      return 'csv'
    case 'application/octet-stream':
      return 'fit'
    default:
      return 'bin'
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'validation', fields: ['body'] }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      },
      { status: 400 },
    )
  }

  const { contentType, fileSizeBytes } = parsed.data

  if (!allowedMimeTypes.has(contentType)) {
    return NextResponse.json({ error: 'unsupported_type' }, { status: 400 })
  }
  if (fileSizeBytes > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_BYTES }, { status: 400 })
  }

  const healthSupabaseUrl = process.env.HEALTH_SUPABASE_URL
  const healthSupabaseServiceKey = process.env.HEALTH_SUPABASE_SERVICE_KEY
  if (!healthSupabaseUrl || !healthSupabaseServiceKey) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const supabase = createClient(healthSupabaseUrl, healthSupabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const ext = extensionFromMime(contentType)
  const storageKey = `health-uploads/${auth.userId}/${crypto.randomUUID()}.${ext}`

  const { data, error } = await supabase
    .storage
    .from('health-uploads')
    .createSignedUploadUrl(storageKey, { upsert: false })

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const response: PresignUploadResponse = {
    uploadUrl: data.signedUrl,
    storageKey,
  }
  return NextResponse.json(response)
}
