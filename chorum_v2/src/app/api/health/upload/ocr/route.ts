export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { convertTiffToPng } from '@/lib/health/tiff'
import { extractFromImage, extractFromText } from '@/lib/health/ocr'
import { extractPdfText } from '@/lib/health/pdf'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'

const RequestSchema = z.object({
  storageKey: z.string().min(1),
  snapshotId: z.string().uuid(),
})

function isTiff(storageKey: string): boolean {
  return /\.tiff?$/i.test(storageKey)
}

function isPdf(storageKey: string): boolean {
  return /\.pdf$/i.test(storageKey)
}

function parseStoragePages(storagePath: string | null): string[] {
  if (!storagePath) return []
  try {
    const parsed = JSON.parse(storagePath) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function getRecordedAt(payload: Record<string, unknown>): Date {
  const candidates = [payload.reportDate, payload.date, payload.recordedAt]
  for (const value of candidates) {
    if (typeof value === 'string') {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return new Date()
}

function mapSnapshotType(documentType: string): 'labs' | 'icd_report' | 'vitals' | 'ocr_document' {
  if (documentType === 'lab_result') return 'labs'
  if (documentType === 'icd_report') return 'icd_report'
  if (documentType === 'vitals') return 'vitals'
  return 'ocr_document'
}

function withIcdPages(payload: Record<string, unknown>, pngPages: string[]): Record<string, unknown> {
  if (pngPages.length === 0) return payload
  return {
    ...payload,
    storagePages: pngPages,
    pngPages,
  }
}

function getStorageClient() {
  const url = process.env.HEALTH_SUPABASE_URL
  const key = process.env.HEALTH_SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('Missing HEALTH_SUPABASE_URL or HEALTH_SUPABASE_SERVICE_KEY')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit(auth.userId, 'ocr')
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

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { storageKey, snapshotId } = parsed.data
  if (!storageKey.startsWith(`health-uploads/${auth.userId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [snapshot] = await healthDb
    .select({ id: healthSnapshots.id, storagePath: healthSnapshots.storagePath })
    .from(healthSnapshots)
    .where(and(
      eq(healthSnapshots.id, snapshotId),
      eq(healthSnapshots.userId, auth.userId),
    ))
    .limit(1)

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  const storage = getStorageClient().storage.from('health-uploads')
  let rawBuffer: Buffer | null = null
  const primaryDownload = await storage.download(storageKey)
  if (!primaryDownload.error && primaryDownload.data) {
    rawBuffer = Buffer.from(await primaryDownload.data.arrayBuffer())
  }

  const keyLower = storageKey.toLowerCase()
  let pageCount = 1
  let pngPages: string[] = []

  if (!rawBuffer && isTiff(keyLower)) {
    pngPages = parseStoragePages(snapshot.storagePath)
    if (pngPages.length > 0) {
      const first = await storage.download(pngPages[0]!)
      if (!first.error && first.data) {
        rawBuffer = Buffer.from(await first.data.arrayBuffer())
      }
    }
  }

  if (!rawBuffer) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 502 })
  }

  const ocrResult = isPdf(keyLower)
    ? await (async () => {
      const pdfResult = await extractPdfText(rawBuffer)
      pageCount = pdfResult.pageCount

      if (!pdfResult.hasText) {
        return null
      }
      return extractFromText(pdfResult.text, auth.userId, pageCount)
    })()
    : isTiff(keyLower)
      ? await (async () => {
        if (pngPages.length === 0) {
          pngPages = await convertTiffToPng(storageKey, auth.userId)
        }
        pageCount = pngPages.length > 0 ? pngPages.length : 1

        let imageBuffer = rawBuffer
        let mimeType: 'image/jpeg' | 'image/png' | 'image/tiff' = 'image/tiff'

        if (pngPages.length > 0) {
          const { data: firstPage, error: firstErr } = await storage.download(pngPages[0]!)
          if (!firstErr && firstPage) {
            imageBuffer = Buffer.from(await firstPage.arrayBuffer())
            mimeType = 'image/png'
          }
        }

        return extractFromImage(imageBuffer, mimeType, auth.userId, pageCount)
      })()
      : await (async () => {
        const mimeType: 'image/jpeg' | 'image/png' = keyLower.endsWith('.png') ? 'image/png' : 'image/jpeg'
        return extractFromImage(rawBuffer, mimeType, auth.userId, pageCount)
      })()

  if (isPdf(keyLower) && !ocrResult) {
    return NextResponse.json(
      {
        error: 'Document appears to be a scanned image PDF with no text layer. Please photograph the document directly using the camera.',
      },
      { status: 422 },
    )
  }

  if (!ocrResult || !ocrResult.payload) {
    return NextResponse.json(
      { error: 'OCR produced no extractable data', confidence: ocrResult?.confidence ?? 'low' },
      { status: 422 },
    )
  }

  const snapshotType = mapSnapshotType(ocrResult.documentType)
  const payload = snapshotType === 'icd_report'
    ? withIcdPages(ocrResult.payload, pngPages)
    : ocrResult.payload

  const payloadHash = hashPHI(payload)
  const encrypted = encryptPHI(payload)

  const [duplicate] = await healthDb
    .select({ id: healthSnapshots.id })
    .from(healthSnapshots)
    .where(and(
      eq(healthSnapshots.userId, auth.userId),
      eq(healthSnapshots.payloadHash, payloadHash),
      ne(healthSnapshots.id, snapshotId),
    ))
    .limit(1)

  if (!duplicate) {
    await healthDb
      .update(healthSnapshots)
      .set({
        type: snapshotType,
        source: 'ocr',
        recordedAt: getRecordedAt(payload),
        encryptedPayload: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadHash,
        storagePath: pngPages.length > 0 ? JSON.stringify(pngPages) : storageKey,
      })
      .where(and(
        eq(healthSnapshots.id, snapshotId),
        eq(healthSnapshots.userId, auth.userId),
      ))
  }

  await logPhiAccess({
    userId: auth.userId,
    actorId: auth.userId,
    action: 'create',
    resourceType: 'snapshot',
    resourceId: duplicate?.id ?? snapshotId,
  })

  return NextResponse.json({
    id: duplicate?.id ?? snapshotId,
    documentType: ocrResult.documentType,
    confidence: ocrResult.confidence,
    pageCount,
    pngPages,
  })
}
