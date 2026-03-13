export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { authenticate } from '@/lib/customization/auth'
import { healthDb } from '@/db/health'
import { healthSnapshots } from '@/db/health-schema'
import { encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { ConversionError, convertTiffToPng } from '@/lib/health/tiff'
import type {
  ConfirmUploadResponse,
  HealthSnapshotSource,
  HealthSnapshotType,
} from '@chorum/health-types'

const snapshotTypes = [
  'garmin_daily',
  'garmin_hrv',
  'labs',
  'icd_report',
  'vitals',
  'mychart',
  'checkup_result',
  'ocr_document',
] as const

const snapshotSources = [
  'garmin',
  'health_connect',
  'ocr',
  'manual',
  'mychart',
  'file_upload',
  'system',
] as const

const confirmUploadSchema = z.object({
  storageKey: z.string().min(1),
  type: z.enum(snapshotTypes),
  recordedAt: z.string().datetime({ offset: true }),
  source: z.enum(snapshotSources),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

function isTiffPath(storageKey: string): boolean {
  return /\.tiff?$/i.test(storageKey)
}

function buildPayload(
  type: HealthSnapshotType,
  metadata: Record<string, unknown> | undefined,
  tiffPages: string[],
): Record<string, unknown> {
  const basePayload = { ...(metadata ?? {}) }

  if (type === 'icd_report' && tiffPages.length > 0) {
    return { ...basePayload, storagePages: tiffPages }
  }

  return Object.keys(basePayload).length > 0
    ? basePayload
    : { uploaded: true }
}

async function createSnapshot(
  userId: string,
  data: {
    type: HealthSnapshotType
    recordedAt: string
    source: HealthSnapshotSource
    payload: Record<string, unknown>
    storagePath: string | null
  },
): Promise<{ id: string; created: boolean }> {
  const payloadHash = hashPHI(data.payload)

  const existing = await healthDb
    .select({ id: healthSnapshots.id })
    .from(healthSnapshots)
    .where(and(
      eq(healthSnapshots.userId, userId),
      eq(healthSnapshots.payloadHash, payloadHash),
    ))
    .limit(1)

  if (existing.length > 0) {
    return { id: existing[0]!.id, created: false }
  }

  const encrypted = encryptPHI(data.payload)
  const inserted = await healthDb
    .insert(healthSnapshots)
    .values({
      userId,
      type: data.type,
      recordedAt: new Date(data.recordedAt),
      source: data.source,
      encryptedPayload: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      payloadHash,
      storagePath: data.storagePath,
    })
    .returning({ id: healthSnapshots.id })

  return { id: inserted[0]!.id, created: true }
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

  const parsed = confirmUploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        fields: parsed.error.issues.map((issue) => issue.path.join('.')),
      },
      { status: 400 },
    )
  }

  const data = parsed.data
  if (!data.storageKey.startsWith(`health-uploads/${auth.userId}/`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let storagePath: string | null = data.storageKey
  let tiffPages: string[] = []
  let tiffError = false

  if (isTiffPath(data.storageKey)) {
    try {
      tiffPages = await convertTiffToPng(data.storageKey, auth.userId)
      storagePath = tiffPages.length > 0 ? JSON.stringify(tiffPages) : null
    } catch (err: unknown) {
      if (err instanceof ConversionError && err.message === 'TIFF exceeds 50 pages') {
        return NextResponse.json({ error: 'tiff_too_large' }, { status: 422 })
      }
      tiffError = true
      storagePath = null
      tiffPages = []
    }
  }

  try {
    const payload = buildPayload(data.type, data.metadata, tiffPages)
    const snapshot = await createSnapshot(auth.userId, {
      type: data.type,
      recordedAt: data.recordedAt,
      source: data.source,
      payload,
      storagePath,
    })

    void logPhiAccess({
      userId: auth.userId,
      actorId: auth.userId,
      action: 'create',
      resourceType: 'snapshot',
      resourceId: snapshot.id,
    })

    const response: ConfirmUploadResponse = {
      snapshotId: snapshot.id,
      tiffPages: tiffPages.length > 0 ? tiffPages : undefined,
      tiffError: tiffError ? true : undefined,
    }
    return NextResponse.json(response, { status: snapshot.created ? 201 : 200 })
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
