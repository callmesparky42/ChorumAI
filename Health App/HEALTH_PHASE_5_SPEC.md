# Health Phase 5 Specification: Camera OCR, Document Upload, Timeline, Chat, Push Notifications

**Version:** 1.0
**Date:** 2026-03-05
**Status:** Ready for execution
**Prerequisite:** Health Phase 1 complete (health DB, crypto, snapshot API, `tiff.ts` Sharp converter).
**Prerequisite:** Health Phase 3 complete (de-identification, health-handlers, crons).
**Prerequisite:** Health Phase 4 complete (mobile app running on device, bearer auth, Health Connect live).
**Guardian gates:** None inherited — health layer is isolated from Chorum core.

---

## Agent Instructions

You are executing **Health Phase 5** — the document intelligence and notification layer of Chorum Health. Your job is to close the loop between paper health records and structured data: users photograph a lab report or ICD transmission, the backend extracts structured values via Vision API, and the data appears in the timeline alongside Garmin metrics. You also deliver push notifications — device token registration, weekly digest, and real-time alerts from the cron checkup. When Phase 5 is done, a user can photograph a lab result, see extracted values in 10 seconds, and receive a Monday-morning push summarizing their health week.

Read this document completely before writing a single file. Every decision is locked. If something is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. `src/lib/health/ocr.ts` — Vision API caller + lab value extractor; also exports `extractFromText()` for PDF text input
2. `src/lib/health/pdf.ts` — Pure-JS PDF text extraction via `pdfjs-dist` (no native binaries); called by the OCR route for `.pdf` uploads
3. `src/app/api/health/upload/ocr/route.ts` — OCR trigger: download from Storage, branch on content type (PDF → text extract; TIFF → PNG convert; JPEG/PNG → Vision), store snapshot
4. `src/app/api/health/push/register/route.ts` — Store Expo push token in `push_tokens` table
5. `src/app/api/health/push/notify/route.ts` — Send a push to the calling user (server-side, internal use)
6. `src/app/api/cron/health-push-digest/route.ts` — Weekly Monday-morning push digest cron
7. `src/app/api/health/chat/route.ts` — **Non-streaming** health chat endpoint returning `{ content: string }` JSON; used by mobile Phase 5. Do NOT remove `/api/health/chat/stream` — Phase 6 upgrades mobile to use that.
8. `src/app/api/health/export/summary/route.ts` — Pre-visit appointment summary: LLM generates a structured clinical one-pager from the full health context
9. `apps/health-mobile/lib/push.ts` — Token registration client + permission request
10. `apps/health-mobile/components/CameraOCR.tsx` — Camera capture → presign → upload → poll component
11. `apps/health-mobile/components/TiffViewer.tsx` — PNG page carousel for ICD reports
12. `apps/health-mobile/components/UploadSheet.tsx` — Bottom sheet: Camera / File picker / Manual entry
13. `apps/health-mobile/app/(tabs)/upload.tsx` — Full upload tab (replaces Phase 4 stub)
14. `apps/health-mobile/app/(tabs)/timeline.tsx` — Full snapshot timeline (replaces Phase 4 stub)
15. `apps/health-mobile/app/(tabs)/chat.tsx` — Chat tab using `/api/health/chat` (non-streaming JSON)
16. `vercel.json` — Add health-push-digest cron entry

**What you will NOT produce:**
- Biometric re-auth for OCR flow — Phase 6
- Scanned image-only PDFs (no text layer) — advise user to photograph instead; text-based PDFs (lab portals, MyChart) are fully supported via `pdf.ts`
- Multi-user household accounts — not in scope
- Doctor portal / sharing — not in scope
- Any UI changes to the web dashboard — it already handles `checkup_result` snapshots from Phase 3
- Any modification to `src/lib/health/crypto.ts`, `src/lib/health/audit.ts`, or the core DB schema
- Any `any` types — use `unknown` + type guards throughout

---

## Reference Documents

| Document | Location | What it governs |
|----------|----------|-----------------|
| Health Spec v2 | `Health App/HEALTH_SPEC_V2.md` | Full architecture, Phase 5 section |
| Phase 1 Spec | `Health App/HEALTH_PHASE_1_SPEC.md` | `tiff.ts`, upload presign/confirm API, `push_tokens` table |
| Phase 3 Spec | `Health App/HEALTH_PHASE_3_SPEC.md` | De-identification patterns, `callProvider()` usage |
| Phase 4 Spec | `Health App/HEALTH_PHASE_4_SPEC.md` | `healthApi` client pattern, bearer auth, stub tabs to replace |
| Crypto layer | `chorum_v2/src/lib/health/crypto.ts` | `encryptPHI`, `decryptPHI` signatures |
| Audit layer | `chorum_v2/src/lib/health/audit.ts` | `logPhiAccess` — call on every upload OCR event |
| Health schema | `chorum_v2/src/db/health-schema.ts` | `push_tokens`, `healthSnapshots` table definitions |
| Health types | `packages/health-types/src/index.ts` | `LabResultPayload`, `ICDReportPayload`, `HealthSnapshotType` |
| TIFF converter | `chorum_v2/src/lib/health/tiff.ts` | `convertTiffToPng(buffer)` — already exists from Phase 1 |

---

## Step 0: Human Prerequisites (Not Agent Work)

> [!IMPORTANT]
> These require human action before the agent proceeds.

### 0.0 — Supabase Storage Bucket Security (Human Action Required)

> [!IMPORTANT]
> The `health-documents` Storage bucket **must NOT be public**. Failure to set this correctly means original TIFF/JPEG files (which are PHI) are accessible to anyone who knows a storage path.

In the Supabase dashboard for the **health project**:
1. Storage → Buckets → `health-documents` → Settings
2. Set **Public** to **OFF**
3. Add a Storage policy: `service_role` only for SELECT/INSERT/DELETE (no authenticated user direct access)

All file reads go through the server-side OCR route using the service role key. The mobile app never gets a direct download URL — it only sees PNG pages served via the `TiffViewer` through signed URLs or the API. The storage paths in the DB are UUIDs (from the presign endpoint) and are not guessable, but RLS is still required.

---

### 0.1 — Add Environment Variables

**Vercel project settings** → Environment Variables → add:

| Variable | Value | Environments |
|----------|-------|--------------|
| `HEALTH_PUSH_DIGEST_SECRET` | `openssl rand -hex 32` | Production, Preview |
| `EXPO_ACCESS_TOKEN` | Expo account token for EAS push | Production only |

**`.env.local`** (do not commit):
```
HEALTH_PUSH_DIGEST_SECRET=...
EXPO_ACCESS_TOKEN=...
```

### 0.2 — Install Dependencies

**Server (`chorum_v2/`):**

```bash
cd chorum_v2
npm install pdfjs-dist@^4.4.168
```

`pdfjs-dist` is pure JavaScript — no native binaries, Vercel-compatible. Used exclusively for text-based PDF extraction (`pdf.ts`). Do NOT install any canvas package; the legacy build used here does not require it.

**Mobile (`apps/health-mobile/`):**

```bash
cd apps/health-mobile
npx expo install expo-camera expo-image-picker expo-notifications
npm install @gorhom/bottom-sheet react-native-svg
```

`@gorhom/bottom-sheet` requires `react-native-reanimated` and `react-native-gesture-handler` — both already in Phase 4 `package.json`.

### 0.3 — Configure EAS Push (for real device notifications)

```bash
npm install -g eas-cli
eas credentials   # select Android → Push Notifications → generate FCM key
```

Expo's push service handles FCM delivery. You never send directly to FCM — always use `https://exp.host/--/api/v2/push/send`.

### 0.4 — Verify Phase 1 + 4 Deliverables Present

Confirm these files exist:
- `src/lib/health/tiff.ts` — `convertTiffToPng(buffer: Buffer): Promise<Buffer[]>`
- `src/app/api/health/upload/presign/route.ts` — returns `{ uploadUrl, storageKey, expiresAt }`
- `src/app/api/health/upload/confirm/route.ts` — creates snapshot from uploaded file
- `src/db/health-schema.ts` — includes `pushTokens` table
- `apps/health-mobile/lib/api.ts` — `healthApi` client with `presignUpload()`, `confirmUpload()`

If any are missing, stop and complete the relevant phase first.

---

## Step 1: Backend — OCR Processing

### 1.1 — `src/lib/health/ocr.ts`

Vision API caller and structured extractor. Calls the Vision-capable provider from the user's provider list (prefers `claude-3-5-sonnet-20241022` or `gpt-4o`).

```typescript
// src/lib/health/ocr.ts
// Calls a Vision-capable LLM provider to extract structured health data from
// an image buffer. Returns typed payloads for storage as health snapshots.
// Never logs raw PHI — only structured extraction results are stored.

import { callProvider }       from '@/lib/providers'
import { getUserProviders }   from '@/lib/agents/provider-configs'
import { deidentifyObject }   from '@/lib/health/deidentify'
import type { LabResultPayload, ICDReportPayload } from '@chorum/health-types'

export type OCRDocumentType = 'lab_result' | 'icd_report' | 'vitals' | 'unknown'

export interface OCRResult {
  documentType: OCRDocumentType
  payload: LabResultPayload | ICDReportPayload | Record<string, unknown> | null
  rawText: string          // de-identified extracted text
  confidence: 'high' | 'medium' | 'low'
  pageCount: number
}

const VISION_PROMPT = `You are a medical document parser. Extract ALL structured data from this health document image.

Respond ONLY with valid JSON matching this schema based on document type:

For LAB RESULTS:
{
  "documentType": "lab_result",
  "confidence": "high"|"medium"|"low",
  "date": "YYYY-MM-DD",
  "panelName": "string",
  "labName": "string or null",
  "values": [
    { "name": "string", "value": number_or_null, "unit": "string", "referenceMin": number_or_null, "referenceMax": number_or_null, "flag": "H"|"L"|"HH"|"LL"|null }
  ]
}

For ICD/DEVICE REPORTS:
{
  "documentType": "icd_report",
  "confidence": "high"|"medium"|"low",
  "reportDate": "YYYY-MM-DD",
  "deviceModel": "string",
  "batteryPercentage": number_or_null,
  "batteryStatus": "string",
  "nsvtCount": number_or_null,
  "svtCount": number_or_null,
  "atrialFibBurden": number_or_null,
  "reviewerNotes": "string"
}

For ANYTHING ELSE:
{
  "documentType": "unknown",
  "confidence": "low",
  "rawText": "everything you can read from the document"
}

Rules:
- Never include patient name, date of birth, address, SSN, MRN, or phone number anywhere in output.
- If a value is illegible, use null.
- Dates must be YYYY-MM-DD. If only month/year visible, use the first of the month.
- Output ONLY the JSON object — no markdown, no explanation.`

function selectVisionProvider(providers: Awaited<ReturnType<typeof getUserProviders>>) {
  // Prefer providers known to support vision in order of capability
  const VISION_MODELS = [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-3-5-sonnet-20241022',
    'gpt-4o',
    'gpt-4-turbo',
    'gemini-1.5-pro',
  ]
  for (const model of VISION_MODELS) {
    const p = providers.find(p => p.model === model)
    if (p) return p
  }
  // Fallback: first provider (may not support vision — we'll get an error)
  return providers[0] ?? null
}

export async function extractFromImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
  userId: string,
  pageCount = 1,
): Promise<OCRResult> {
  const providers = await getUserProviders(userId)
  const provider  = selectVisionProvider(providers)

  if (!provider) {
    return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
  }

  // Convert buffer to base64 data URL
  const base64    = imageBuffer.toString('base64')
  const dataUrl   = `data:${mimeType};base64,${base64}`

  const messages: { role: 'user'; content: Array<{ type: string; [k: string]: unknown }> }[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: 'Extract all structured health data from this document image.' },
      ],
    },
  ]

  const result = await callProvider(provider, messages as Parameters<typeof callProvider>[1], VISION_PROMPT)

  const rawText = typeof result === 'string' ? result : ''

  let parsed: Record<string, unknown>
  try {
    // Strip markdown code fences if model wrapped output
    const clean = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean) as Record<string, unknown>
  } catch {
    return { documentType: 'unknown', payload: null, rawText: deidentifyObject({ rawText }) as string, confidence: 'low', pageCount }
  }

  const documentType = (parsed['documentType'] as OCRDocumentType | undefined) ?? 'unknown'
  const confidence   = (parsed['confidence'] as OCRResult['confidence'] | undefined) ?? 'low'

  // De-identify reviewer notes and any free-text fields
  const safePayload = deidentifyObject(parsed) as Record<string, unknown>

  if (documentType === 'lab_result') {
    const payload: LabResultPayload = {
      date:      typeof safePayload['date'] === 'string' ? safePayload['date'] : new Date().toISOString().split('T')[0]!,
      panelName: typeof safePayload['panelName'] === 'string' ? safePayload['panelName'] : 'Unknown Panel',
      values:    Array.isArray(safePayload['values']) ? safePayload['values'] as LabResultPayload['values'] : [],
      orderedBy: undefined,
      labName:   typeof safePayload['labName'] === 'string' ? safePayload['labName'] : undefined,
    }
    return { documentType, payload, rawText, confidence, pageCount }
  }

  if (documentType === 'icd_report') {
    const payload: ICDReportPayload = {
      reportDate:        typeof safePayload['reportDate'] === 'string' ? safePayload['reportDate'] : new Date().toISOString().split('T')[0]!,
      deviceModel:       typeof safePayload['deviceModel'] === 'string' ? safePayload['deviceModel'] : 'Unknown',
      batteryPercentage: typeof safePayload['batteryPercentage'] === 'number' ? safePayload['batteryPercentage'] : null,
      batteryStatus:     typeof safePayload['batteryStatus'] === 'string' ? safePayload['batteryStatus'] : '',
      nsvtCount:         typeof safePayload['nsvtCount'] === 'number' ? safePayload['nsvtCount'] : null,
      svtCount:          typeof safePayload['svtCount'] === 'number' ? safePayload['svtCount'] : null,
      atrialFibBurden:   typeof safePayload['atrialFibBurden'] === 'number' ? safePayload['atrialFibBurden'] : null,
      reviewerNotes:     typeof safePayload['reviewerNotes'] === 'string' ? safePayload['reviewerNotes'] : '',
      pngPages:          [],  // populated by upload confirm route
    }
    return { documentType, payload, rawText, confidence, pageCount }
  }

  // documentType === 'unknown'
  return {
    documentType: 'unknown',
    payload:      { rawText: deidentifyObject(rawText) },
    rawText,
    confidence,
    pageCount,
  }
}

/**
 * Extract structured health data from pre-extracted PDF text.
 * Used when the upload is a text-based PDF (lab portal export, MyChart PDF, etc.)
 * instead of an image — avoids an unnecessary Vision API call.
 *
 * The LLM receives the same structured extraction prompt as `extractFromImage`,
 * but as plain text rather than a base64 image. Same return shape.
 */
export async function extractFromText(
  text: string,
  userId: string,
  pageCount = 1,
): Promise<OCRResult> {
  const providers = await getUserProviders(userId)
  // Text extraction doesn't need Vision — prefer the best reasoning model available
  const TEXT_MODELS = [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-3-5-sonnet-20241022',
    'gpt-4o',
    'gemini-1.5-pro',
  ]
  const provider = providers.find(p => TEXT_MODELS.includes(p.model ?? '')) ?? providers[0] ?? null

  if (!provider) {
    return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
  }

  const messages: { role: 'user'; content: string }[] = [
    {
      role:    'user',
      content: `Extract all structured health data from the following document text.\n\n${text}`,
    },
  ]

  const result  = await callProvider(provider, messages as Parameters<typeof callProvider>[1], VISION_PROMPT)
  const rawText = typeof result === 'string' ? result : ''

  let parsed: Record<string, unknown>
  try {
    const clean = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean) as Record<string, unknown>
  } catch {
    return { documentType: 'unknown', payload: null, rawText: deidentifyObject({ rawText }) as string, confidence: 'low', pageCount }
  }

  const documentType = (parsed['documentType'] as OCRDocumentType | undefined) ?? 'unknown'
  const confidence   = (parsed['confidence']   as OCRResult['confidence'] | undefined) ?? 'low'
  const safePayload  = deidentifyObject(parsed) as Record<string, unknown>

  if (documentType === 'lab_result') {
    const payload: LabResultPayload = {
      date:      typeof safePayload['date'] === 'string' ? safePayload['date'] : new Date().toISOString().split('T')[0]!,
      panelName: typeof safePayload['panelName'] === 'string' ? safePayload['panelName'] : 'Unknown Panel',
      values:    Array.isArray(safePayload['values']) ? safePayload['values'] as LabResultPayload['values'] : [],
      orderedBy: undefined,
      labName:   typeof safePayload['labName'] === 'string' ? safePayload['labName'] : undefined,
    }
    return { documentType, payload, rawText, confidence, pageCount }
  }

  if (documentType === 'icd_report') {
    const payload: ICDReportPayload = {
      reportDate:        typeof safePayload['reportDate'] === 'string' ? safePayload['reportDate'] : new Date().toISOString().split('T')[0]!,
      deviceModel:       typeof safePayload['deviceModel'] === 'string' ? safePayload['deviceModel'] : 'Unknown',
      batteryPercentage: typeof safePayload['batteryPercentage'] === 'number' ? safePayload['batteryPercentage'] : null,
      batteryStatus:     typeof safePayload['batteryStatus'] === 'string' ? safePayload['batteryStatus'] : '',
      nsvtCount:         typeof safePayload['nsvtCount'] === 'number' ? safePayload['nsvtCount'] : null,
      svtCount:          typeof safePayload['svtCount'] === 'number' ? safePayload['svtCount'] : null,
      atrialFibBurden:   typeof safePayload['atrialFibBurden'] === 'number' ? safePayload['atrialFibBurden'] : null,
      reviewerNotes:     typeof safePayload['reviewerNotes'] === 'string' ? safePayload['reviewerNotes'] : '',
      pngPages:          [],
    }
    return { documentType, payload, rawText, confidence, pageCount }
  }

  return {
    documentType: 'unknown',
    payload:      { rawText: deidentifyObject(rawText) },
    rawText,
    confidence,
    pageCount,
  }
}
```

---

### 1.1b — `src/lib/health/pdf.ts`

Pure-JavaScript PDF text extraction. **Already written** — this file was created outside the spec. Include it verbatim; do not modify.

```typescript
// src/lib/health/pdf.ts
// PDF text extraction for health document ingestion.
// Uses pdfjs-dist (pure JavaScript, no native binaries, Vercel-compatible).
//
// Called by: src/app/api/health/upload/ocr/route.ts
export const runtime = 'nodejs'

export interface PdfExtractResult {
  text:      string    // full concatenated text, pages separated by marker
  pageCount: number
  hasText:   boolean   // false if all pages returned empty text (scanned PDF)
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as {
      getDocument: (params: { data: Uint8Array; useWorkerFetch?: boolean; isEvalSupported?: boolean; useSystemFonts?: boolean }) => { promise: Promise<PDFDocumentProxy> }
    }
    interface PDFDocumentProxy {
      numPages: number
      getPage(n: number): Promise<PDFPageProxy>
    }
    interface PDFPageProxy {
      getTextContent(): Promise<{ items: Array<{ str?: string }> }>
    }
    const data = new Uint8Array(buffer)
    const doc  = await pdfjs.getDocument({
      data,
      useWorkerFetch:  false,
      isEvalSupported: false,
      useSystemFonts:  true,
    }).promise
    const pageCount = doc.numPages
    const pages: string[] = []
    for (let i = 1; i <= pageCount; i++) {
      const page    = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map(item => item.str ?? '')
        .join(' ')
        .replace(/\s{3,}/g, '\n')
        .trim()
      if (pageText) pages.push(pageText)
    }
    const text    = pages.join('\n\n--- Page Break ---\n\n')
    const hasText = text.trim().length > 50
    return { text, pageCount, hasText }
  } catch {
    return { text: '', pageCount: 0, hasText: false }
  }
}
```

### 1.2 — `src/app/api/health/upload/ocr/route.ts`

Triggered after file upload is confirmed. Downloads from Supabase Storage, converts TIFF if needed, calls OCR, stores snapshot.

```typescript
// src/app/api/health/upload/ocr/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate }             from '@/lib/customization/auth'
import { healthDb }                 from '@/db/health'
import { healthSnapshots }          from '@/db/health-schema'
import { encryptPHI, hashPHI }      from '@/lib/health/crypto'
import { logPhiAccess }             from '@/lib/health/audit'
import { convertTiffToPng }         from '@/lib/health/tiff'
import { extractFromImage, extractFromText } from '@/lib/health/ocr'
import { extractPdfText }           from '@/lib/health/pdf'
import { eq, and }                  from 'drizzle-orm'
import { createClient }             from '@supabase/supabase-js'

const supabase = createClient(
  process.env.HEALTH_SUPABASE_URL!,
  process.env.HEALTH_SUPABASE_SERVICE_KEY!,
)

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { storageKey?: string; snapshotId?: string }
  const { storageKey, snapshotId } = body

  if (!storageKey || !snapshotId) {
    return NextResponse.json({ error: 'storageKey and snapshotId required' }, { status: 400 })
  }

  // Verify snapshot belongs to user
  const [snapshot] = await healthDb
    .select()
    .from(healthSnapshots)
    .where(and(eq(healthSnapshots.id, snapshotId), eq(healthSnapshots.userId, auth.userId)))
    .limit(1)

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  // Download from Supabase Storage
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from('health-documents')
    .download(storageKey)

  if (downloadErr || !fileData) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 502 })
  }

  const rawBuffer = Buffer.from(await fileData.arrayBuffer())
  const keyLower  = storageKey.toLowerCase()
  const isTiff    = keyLower.endsWith('.tiff') || keyLower.endsWith('.tif')
  const isPdf     = keyLower.endsWith('.pdf')

  let pageCount = 1
  let pngPaths: string[] = []
  let ocrResult: Awaited<ReturnType<typeof extractFromImage>>

  if (isPdf) {
    // ── PDF path: extract text layer via pdfjs-dist (no Vision API call needed) ──
    const pdfResult = await extractPdfText(rawBuffer)
    pageCount = pdfResult.pageCount

    if (!pdfResult.hasText) {
      // Scanned PDF — no text layer. Vision on a rendered page would work but
      // requires native canvas (incompatible with Vercel). Advise photograph instead.
      return NextResponse.json(
        { error: 'Document appears to be a scanned image PDF with no text layer. Please photograph the document directly using the camera.' },
        { status: 422 },
      )
    }

    ocrResult = await extractFromText(pdfResult.text, auth.userId, pageCount)
  } else if (isTiff) {
    // ── TIFF path: convert pages to PNG, run Vision on page 1 ──
    let imageBuffer: Buffer
    let mimeType: 'image/jpeg' | 'image/png' | 'image/tiff'

    const pages = await convertTiffToPng(rawBuffer)
    pageCount   = pages.length
    imageBuffer = pages[0]!   // OCR first page; multi-page reports deduce from context

    for (let i = 0; i < pages.length; i++) {
      const pngKey  = storageKey.replace(/\.tiff?$/i, `_page${i + 1}.png`)
      const { error } = await supabase.storage
        .from('health-documents')
        .upload(pngKey, pages[i]!, { contentType: 'image/png', upsert: true })
      if (!error) pngPaths.push(pngKey)
    }
    mimeType  = 'image/png'
    ocrResult = await extractFromImage(imageBuffer, mimeType, auth.userId, pageCount)
  } else {
    // ── JPEG / PNG path: pass directly to Vision ──
    const imageBuffer = rawBuffer
    const mimeType: 'image/jpeg' | 'image/png' = keyLower.endsWith('.png') ? 'image/png' : 'image/jpeg'
    ocrResult = await extractFromImage(imageBuffer, mimeType, auth.userId, pageCount)
  }

  if (!ocrResult.payload) {
    return NextResponse.json({ error: 'OCR produced no extractable data', confidence: ocrResult.confidence }, { status: 422 })
  }

  // Attach PNG page paths for ICD reports
  if (ocrResult.documentType === 'icd_report' && typeof ocrResult.payload === 'object' && ocrResult.payload !== null && 'pngPages' in ocrResult.payload) {
    (ocrResult.payload as { pngPages: string[] }).pngPages = pngPaths
  }

  // Encrypt and store as a new snapshot
  const finalPayload  = ocrResult.payload
  const hash          = hashPHI(finalPayload)
  const encrypted     = encryptPHI(finalPayload)
  const snapshotType  = ocrResult.documentType === 'lab_result' ? 'labs'
                      : ocrResult.documentType === 'icd_report' ? 'icd_report'
                      : 'vitals'

  const [newRow] = await healthDb
    .insert(healthSnapshots)
    .values({
      userId:           auth.userId,
      type:             snapshotType,
      recordedAt:       new Date(),
      source:           'ocr',
      encryptedPayload: encrypted.ciphertext,
      payloadIv:        `${encrypted.iv}:${encrypted.tag}`,
      payloadHash:      hash,
      storagePath:      storageKey,
    })
    .returning({ id: healthSnapshots.id })
    .onConflictDoNothing()

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'create', resourceType: 'snapshot' })

  if (!newRow) {
    return NextResponse.json({ error: 'Duplicate document — already processed' }, { status: 409 })
  }

  return NextResponse.json({
    id:           newRow.id,
    documentType: ocrResult.documentType,
    confidence:   ocrResult.confidence,
    pageCount,
    pngPages:     pngPaths,
  })
}
```

---

## Step 2: Backend — Push Notifications

### 2.1 — `src/app/api/health/push/register/route.ts`

Stores Expo push token for the authenticated user.

```typescript
// src/app/api/health/push/register/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate }             from '@/lib/customization/auth'
import { healthDb }                 from '@/db/health'
import { pushTokens }               from '@/db/health-schema'
import { eq, and }                  from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { token?: string; platform?: string }
  const { token, platform = 'android' } = body

  if (!token || !token.startsWith('ExponentPushToken[')) {
    return NextResponse.json({ error: 'Invalid Expo push token format' }, { status: 400 })
  }

  // Upsert: same token should not create duplicates
  await healthDb
    .insert(pushTokens)
    .values({ userId: auth.userId, token, platform })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set:    { active: true },
    })

  return NextResponse.json({ registered: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { token?: string }
  const { token } = body

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  await healthDb
    .update(pushTokens)
    .set({ active: false })
    .where(and(eq(pushTokens.token, token), eq(pushTokens.userId, auth.userId)))

  return NextResponse.json({ unregistered: true })
}
```

### 2.2 — `src/app/api/health/push/notify/route.ts`

Internal endpoint for server-side push (crons call this). Accepts `userId` + `title` + `body` + optional `data`. Protected by `GARMIN_CRON_SECRET` (reuse existing secret — it is the general health cron secret).

```typescript
// src/app/api/health/push/notify/route.ts
// Internal-only: send a push notification to all active tokens for a user.
// Called by cron jobs, not by the mobile client.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb }                 from '@/db/health'
import { pushTokens }               from '@/db/health-schema'
import { eq, and }                  from 'drizzle-orm'

interface ExpoPushMessage {
  to:    string
  title: string
  body:  string
  data?: Record<string, unknown>
  sound?: 'default'
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(messages),
  })
  if (!response.ok) {
    throw new Error(`Expo push failed: ${response.status}`)
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.GARMIN_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    userId?: string
    title?:  string
    body?:   string
    data?:   Record<string, unknown>
  }
  const { userId, title, body: msgBody, data } = body

  if (!userId || !title || !msgBody) {
    return NextResponse.json({ error: 'userId, title, body required' }, { status: 400 })
  }

  const tokens = await healthDb
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, userId), eq(pushTokens.active, true)))

  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 'no active tokens' })
  }

  const messages: ExpoPushMessage[] = tokens.map(t => ({
    to:    t.token,
    title,
    body:  msgBody,
    sound: 'default',
    data,
  }))

  try {
    await sendExpoPush(messages)
    return NextResponse.json({ sent: messages.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Push failed' }, { status: 502 })
  }
}
```

### 2.3 — `src/app/api/cron/health-push-digest/route.ts`

Weekly Monday-morning digest. Fetches the most recent `checkup_result` snapshot per user and pushes a one-sentence summary. Runs at 8:15 AM UTC Monday (after the health-checkup cron at 8:00 AM).

```typescript
// src/app/api/cron/health-push-digest/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb }                 from '@/db/health'
import { healthSnapshots, pushTokens } from '@/db/health-schema'
import { decryptPHI }               from '@/lib/health/crypto'
import { eq, desc, inArray }        from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.HEALTH_PUSH_DIGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all users who have active push tokens
  const tokenRows = await healthDb
    .selectDistinct({ userId: pushTokens.userId })
    .from(pushTokens)
    .where(eq(pushTokens.active, true))

  const userIds = tokenRows.map(r => r.userId)
  if (userIds.length === 0) return NextResponse.json({ sent: 0 })

  // For each user, get latest checkup_result snapshot
  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      // Query the most recent checkup_result snapshot for this user
      const [checkupRow] = await healthDb
        .select()
        .from(healthSnapshots)
        .where(eq(healthSnapshots.userId, userId))
        .orderBy(desc(healthSnapshots.recordedAt))
        .limit(1)

      if (!checkupRow || checkupRow.type !== 'checkup_result') return

      let summary = 'Your weekly health summary is ready.'
      try {
        const payload = decryptPHI(checkupRow.encryptedPayload, checkupRow.payloadIv) as Record<string, unknown>
        const analysis = typeof payload['analysis'] === 'string' ? payload['analysis'] : ''
        // First sentence of analysis, capped at 100 chars
        const firstSentence = analysis.split(/[.!?]/)[0]?.trim() ?? ''
        if (firstSentence.length > 0) {
          summary = firstSentence.length > 100 ? firstSentence.slice(0, 97) + '…' : firstSentence
        }
      } catch { /* use default summary */ }

      // Call the notify endpoint internally
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/health/push/notify`, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-cron-secret':  process.env.GARMIN_CRON_SECRET!,
        },
        body: JSON.stringify({
          userId,
          title: 'Chorum Health Weekly Summary',
          body:  summary,
          data:  { screen: 'dashboard' },
        }),
      })
    })
  )

  const sent    = results.filter(r => r.status === 'fulfilled').length
  const failed  = results.filter(r => r.status === 'rejected').length
  return NextResponse.json({ sent, failed })
}
```

### 2.4 — `vercel.json` — Add digest cron

Add to the existing `crons` array in `vercel.json`:

```json
{ "path": "/api/cron/health-push-digest", "schedule": "15 8 * * 1" }
```

Full `crons` array after this addition:
```json
"crons": [
  { "path": "/api/cron/health-garmin-sync",  "schedule": "0 */6 * * *" },
  { "path": "/api/cron/health-checkup",      "schedule": "0 8 * * 1" },
  { "path": "/api/cron/health-push-digest",  "schedule": "15 8 * * 1" }
]
```

---

## Step 3: Mobile — Push Token Registration

### 3.1 — `apps/health-mobile/lib/push.ts`

Requests notification permission, gets Expo push token, registers with server.

```typescript
// apps/health-mobile/lib/push.ts
import * as Notifications from 'expo-notifications'
import Constants          from 'expo-constants'
import { healthApi }      from '@/lib/api'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
})

export async function registerPushToken(): Promise<string | null> {
  // Check/request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  if (!projectId) {
    console.warn('EAS projectId not set in app.json — push tokens will not work on physical devices')
    return null
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
  const token     = tokenData.data

  // Register with server (fire-and-forget — don't block app startup)
  healthApi.registerPushToken(token).catch(() => {
    // Non-critical: silently retry on next launch
  })

  return token
}

export function usePushNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
) {
  // Used in _layout.tsx to handle foreground notifications
  return Notifications.addNotificationReceivedListener(onReceive)
}
```

### 3.2 — Update `apps/health-mobile/lib/api.ts`

Add `registerPushToken` and `triggerOCR` methods to the existing `healthApi` client (add to the class, do not rewrite the file).

```typescript
// Add these methods to the HealthApiClient class in apps/health-mobile/lib/api.ts:

async registerPushToken(token: string): Promise<void> {
  await this.post('/api/health/push/register', { token, platform: 'android' })
}

async unregisterPushToken(token: string): Promise<void> {
  await this.delete('/api/health/push/register', { token })
}

async triggerOCR(params: {
  storageKey: string
  snapshotId: string
}): Promise<{
  id: string
  documentType: string
  confidence: string
  pageCount: number
  pngPages: string[]
}> {
  return this.post('/api/health/upload/ocr', params)
}
```

---

## Step 4: Mobile — Camera OCR Component

### 4.1 — `apps/health-mobile/components/CameraOCR.tsx`

Full camera capture flow: camera preview → capture → presign → upload → call OCR endpoint → callback with result. Supports both camera capture and file picker fallback.

```typescript
// apps/health-mobile/components/CameraOCR.tsx
import React, { useState, useRef }          from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions }  from 'expo-camera'
import * as ImagePicker                      from 'expo-image-picker'
import { healthApi }                         from '@/lib/api'

interface CameraOCRProps {
  onComplete: (result: { id: string; documentType: string; confidence: string }) => void
  onCancel:   () => void
}

type Stage = 'preview' | 'uploading' | 'processing' | 'done' | 'error'

export function CameraOCR({ onComplete, onCancel }: CameraOCRProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [stage, setStage]   = useState<Stage>('preview')
  const [error, setError]   = useState<string | null>(null)
  const cameraRef           = useRef<CameraView>(null)

  async function captureAndProcess(uri: string, filename: string, contentType: 'image/jpeg' | 'image/png') {
    try {
      setStage('uploading')

      // 1. Presign
      const sizeBytes = 5 * 1024 * 1024  // conservative estimate; server validates actual
      const presign = await healthApi.presignUpload({ filename, contentType, sizeBytes })

      // 2. Upload to Supabase Storage
      const fileResponse = await fetch(uri)
      const blob         = await fileResponse.blob()
      const uploadResp   = await fetch(presign.uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': contentType },
        body:    blob,
      })
      if (!uploadResp.ok) throw new Error('Upload failed')

      // 3. Confirm upload (creates snapshot stub)
      const confirm = await healthApi.confirmUpload({
        storageKey: presign.storageKey,
        type:       'labs',    // OCR will correct the type
        recordedAt: new Date().toISOString(),
        source:     'ocr',
      })

      setStage('processing')

      // 4. Trigger OCR
      const ocr = await healthApi.triggerOCR({
        storageKey: presign.storageKey,
        snapshotId: confirm.id,
      })

      setStage('done')
      onComplete({ id: ocr.id, documentType: ocr.documentType, confidence: ocr.confidence })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStage('error')
    }
  }

  async function takePhoto() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85, base64: false })
    if (!photo) return
    await captureAndProcess(photo.uri, `capture_${Date.now()}.jpg`, 'image/jpeg')
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.9,
    })
    if (result.canceled || !result.assets[0]) return
    const asset    = result.assets[0]
    const filename = asset.uri.split('/').at(-1) ?? `pick_${Date.now()}.jpg`
    await captureAndProcess(asset.uri, filename, 'image/jpeg')
  }

  if (!permission?.granted) {
    return (
      <View style={s.center}>
        <Text style={s.text}>Camera permission required</Text>
        <TouchableOpacity style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={pickFromLibrary}>
          <Text style={s.btnText}>Choose from Library</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[s.text, { marginTop: 12 }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (stage === 'uploading' || stage === 'processing') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={[s.text, { marginTop: 16 }]}>
          {stage === 'uploading' ? 'Uploading…' : 'Extracting data…'}
        </Text>
      </View>
    )
  }

  if (stage === 'error') {
    return (
      <View style={s.center}>
        <Text style={[s.text, { color: '#f87171' }]}>{error ?? 'Unknown error'}</Text>
        <TouchableOpacity style={s.btn} onPress={() => setStage('preview')}>
          <Text style={s.btnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[s.text, { marginTop: 12 }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <View style={s.controls}>
        <TouchableOpacity onPress={onCancel} style={s.btnSecondary}>
          <Text style={s.btnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={takePhoto} style={s.capture} />
        <TouchableOpacity onPress={pickFromLibrary} style={s.btnSecondary}>
          <Text style={s.btnText}>Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', padding: 24 },
  text:        { color: '#e5e7eb', fontSize: 15 },
  btn:         { marginTop: 16, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnSecondary:{ marginTop: 8, backgroundColor: '#1f2937', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  btnText:     { color: '#fff', fontWeight: '600' },
  controls:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' },
  capture:     { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', borderWidth: 4, borderColor: '#60a5fa' },
})
```

---

## Step 5: Mobile — TIFF Viewer

### 5.1 — `apps/health-mobile/components/TiffViewer.tsx`

PNG page carousel for multi-page ICD device reports. Receives an array of Supabase Storage paths. Fetches each page as a signed URL (or direct public URL if bucket is public) and displays as a horizontally scrollable image carousel.

```typescript
// apps/health-mobile/components/TiffViewer.tsx
import React, { useState }          from 'react'
import { View, Image, ScrollView, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native'
import { healthApi }                 from '@/lib/api'

interface TiffViewerProps {
  pngPaths: string[]    // Supabase Storage keys (not full URLs)
  title?:   string
}

const { width } = Dimensions.get('window')

export function TiffViewer({ pngPaths, title }: TiffViewerProps) {
  const [currentPage, setCurrentPage] = useState(0)
  // Construct URLs — assumes bucket is public. If private, swap for signed-URL API call.
  const baseUrl = process.env.EXPO_PUBLIC_HEALTH_SUPABASE_URL ?? ''
  const urls    = pngPaths.map(p => `${baseUrl}/storage/v1/object/public/health-documents/${p}`)

  if (urls.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>No pages available</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const page = Math.round(e.nativeEvent.contentOffset.x / width)
          setCurrentPage(page)
        }}
      >
        {urls.map((url, i) => (
          <Image
            key={i}
            source={{ uri: url }}
            style={{ width, height: width * 1.4 }}
            resizeMode="contain"
          />
        ))}
      </ScrollView>
      <Text style={s.pageIndicator}>
        Page {currentPage + 1} of {urls.length}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  empty:         { padding: 32, alignItems: 'center' },
  emptyText:     { color: '#9ca3af', fontSize: 14 },
  title:         { color: '#e5e7eb', fontSize: 16, fontWeight: '600', padding: 16 },
  pageIndicator: { color: '#6b7280', textAlign: 'center', padding: 8, fontSize: 13 },
})
```

---

## Step 6: Mobile — Upload Sheet

### 6.1 — `apps/health-mobile/components/UploadSheet.tsx`

Bottom sheet with three upload options: Camera OCR, File Picker (PDF/image), Manual vitals entry. Camera option opens `CameraOCR` as a modal overlay.

```typescript
// apps/health-mobile/components/UploadSheet.tsx
import React, { useCallback, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import BottomSheet, { BottomSheetView }          from '@gorhom/bottom-sheet'
import { Camera, FileText, Heart }               from 'lucide-react-native'
import { CameraOCR }                             from '@/components/CameraOCR'

interface UploadSheetProps {
  onClose:    () => void
  onUploaded: (id: string, documentType: string) => void
}

export function UploadSheet({ onClose, onUploaded }: UploadSheetProps) {
  const sheetRef  = useRef<BottomSheet>(null)
  const snapPoints = ['40%']
  const [showCamera, setShowCamera] = useState(false)

  const handleCameraComplete = useCallback((result: { id: string; documentType: string; confidence: string }) => {
    setShowCamera(false)
    onUploaded(result.id, result.documentType)
  }, [onUploaded])

  if (showCamera) {
    return (
      <Modal animationType="slide" presentationStyle="fullScreen">
        <CameraOCR
          onComplete={handleCameraComplete}
          onCancel={() => setShowCamera(false)}
        />
      </Modal>
    )
  }

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={s.sheetBg}
      handleIndicatorStyle={s.handle}
    >
      <BottomSheetView style={s.content}>
        <Text style={s.title}>Add Health Document</Text>

        <TouchableOpacity style={s.option} onPress={() => setShowCamera(true)}>
          <Camera size={24} color="#60a5fa" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Scan Document</Text>
            <Text style={s.optionSub}>Camera OCR — lab results, ICD reports</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.option} onPress={() => {
          // File picker for saved images — reuse CameraOCR's pickFromLibrary flow
          // by opening CameraOCR with auto-launch-library flag (future enhancement)
          setShowCamera(true)
        }}>
          <FileText size={24} color="#a78bfa" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Choose File</Text>
            <Text style={s.optionSub}>JPEG, PNG, TIFF from your device</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={s.option} onPress={() => {
          // Manual vitals entry — Phase 5 shows a simple form; Phase 6 can expand
          onClose()
        }}>
          <Heart size={24} color="#34d399" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Manual Entry</Text>
            <Text style={s.optionSub}>Blood pressure, weight, notes</Text>
          </View>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  sheetBg:     { backgroundColor: '#111827' },
  handle:      { backgroundColor: '#374151' },
  content:     { flex: 1, padding: 20 },
  title:       { color: '#e5e7eb', fontSize: 17, fontWeight: '700', marginBottom: 20 },
  option:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  optionText:  { marginLeft: 14 },
  optionTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: '600' },
  optionSub:   { color: '#6b7280', fontSize: 13, marginTop: 2 },
})
```

---

## Step 7: Mobile — Full Tab Implementations

### 7.1 — `apps/health-mobile/app/(tabs)/upload.tsx`

Replace the Phase 4 stub with the full upload tab.

```typescript
// apps/health-mobile/app/(tabs)/upload.tsx
import React, { useState }   from 'react'
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { SafeAreaView }      from 'react-native-safe-area-context'
import { Plus }              from 'lucide-react-native'
import { UploadSheet }       from '@/components/UploadSheet'

interface RecentUpload {
  id:           string
  documentType: string
  uploadedAt:   Date
}

export default function UploadTab() {
  const [showSheet, setShowSheet]   = useState(false)
  const [uploads, setUploads]       = useState<RecentUpload[]>([])

  function handleUploaded(id: string, documentType: string) {
    setUploads(prev => [{ id, documentType, uploadedAt: new Date() }, ...prev])
    setShowSheet(false)
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.heading}>Upload</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowSheet(true)}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {uploads.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No uploads yet</Text>
          <Text style={s.emptySub}>Tap + to scan a lab result, ICD report, or other health document.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowSheet(true)}>
            <Text style={s.emptyBtnText}>Scan Document</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={uploads}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={s.uploadRow}>
              <Text style={s.uploadType}>{item.documentType.replace('_', ' ')}</Text>
              <Text style={s.uploadDate}>{item.uploadedAt.toLocaleString()}</Text>
            </View>
          )}
        />
      )}

      {showSheet && (
        <UploadSheet
          onClose={() => setShowSheet(false)}
          onUploaded={handleUploaded}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0a0a' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  heading:      { color: '#f9fafb', fontSize: 22, fontWeight: '700' },
  addBtn:       { backgroundColor: '#2563eb', padding: 8, borderRadius: 8 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle:   { color: '#e5e7eb', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:     { color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn:     { marginTop: 24, backgroundColor: '#2563eb', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  uploadRow:    { backgroundColor: '#111827', padding: 14, borderRadius: 8, marginBottom: 8 },
  uploadType:   { color: '#e5e7eb', fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  uploadDate:   { color: '#6b7280', fontSize: 12, marginTop: 4 },
})
```

### 7.2 — `apps/health-mobile/app/(tabs)/timeline.tsx`

Replace Phase 4 stub with a paginated snapshot timeline. Fetches from `GET /api/health/snapshots` (already exists from Phase 1). Tapping an ICD report entry opens `TiffViewer`.

```typescript
// apps/health-mobile/app/(tabs)/timeline.tsx
import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { SafeAreaView }     from 'react-native-safe-area-context'
import { TiffViewer }       from '@/components/TiffViewer'
import { healthApi }        from '@/lib/api'
import type { SnapshotSummary } from '@chorum/health-types'

export default function TimelineTab() {
  const [snapshots, setSnapshots]   = useState<SnapshotSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [selectedIcd, setSelectedIcd] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await healthApi.getSnapshots()
      setSnapshots(data)
    } catch { /* no-op */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const typeLabel: Record<string, string> = {
    garmin_daily:   'Garmin Daily',
    garmin_hrv:     'HRV',
    labs:           'Lab Result',
    icd_report:     'ICD Report',
    vitals:         'Vitals',
    mychart:        'MyChart',
    checkup_result: 'Weekly Checkup',
  }

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.heading}>Timeline</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#60a5fa" />
      ) : (
        <FlatList
          data={snapshots}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.row}
              onPress={() => {
                if (item.type === 'icd_report') {
                  // TiffViewer needs pngPages — we'll show placeholder until detail API exists
                  setSelectedIcd([])
                }
              }}
              activeOpacity={item.type === 'icd_report' ? 0.7 : 1}
            >
              <View style={s.rowLeft}>
                <Text style={s.rowType}>{typeLabel[item.type] ?? item.type}</Text>
                <Text style={s.rowDate}>{new Date(item.recordedAt).toLocaleDateString()}</Text>
              </View>
              <View style={s.rowRight}>
                <Text style={s.rowSource}>{item.source}</Text>
                {item.type === 'icd_report' && (
                  <Text style={s.rowTap}>View pages →</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {selectedIcd !== null && (
        <Modal animationType="slide">
          <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
            <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedIcd(null)}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
            <TiffViewer pngPaths={selectedIcd} title="ICD Report Pages" />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0a0a0a' },
  heading:     { color: '#f9fafb', fontSize: 22, fontWeight: '700', padding: 20, paddingBottom: 8 },
  row:         { backgroundColor: '#111827', padding: 14, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  rowLeft:     { flex: 1 },
  rowRight:    { alignItems: 'flex-end' },
  rowType:     { color: '#e5e7eb', fontSize: 14, fontWeight: '600' },
  rowDate:     { color: '#6b7280', fontSize: 12, marginTop: 2 },
  rowSource:   { color: '#4b5563', fontSize: 12 },
  rowTap:      { color: '#60a5fa', fontSize: 12, marginTop: 4 },
  closeBtn:    { padding: 20 },
  closeBtnText:{ color: '#60a5fa', fontSize: 15 },
})
```

### 7.3 — `apps/health-mobile/app/(tabs)/chat.tsx`

Replace Phase 4 stub with a fully functional chat tab backed by the health-governed chat endpoint. Sends messages to `POST /api/health/chat/stream` — a dedicated endpoint with hard topic guardrails (health/nutrition only), de-identified health data pre-injected into context, and explicit refusal for off-topic requests. Do NOT use `/api/chat/stream` — that is the general Chorum endpoint with no health governance.

```typescript
// apps/health-mobile/app/(tabs)/chat.tsx
import React, { useState, useRef, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { Send }           from 'lucide-react-native'
import { healthApi }      from '@/lib/api'

interface Message {
  id:      string
  role:    'user' | 'assistant'
  content: string
}

export default function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id:      'welcome',
      role:    'assistant',
      content: 'Hello! I\'m your Health Monitor. Ask me about your recent health data, trends, or general health questions.',
    },
  ])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const listRef                 = useRef<FlatList>(null)

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const response = await healthApi.chat(text)
      const assistantMsg: Message = {
        id:      (Date.now() + 1).toString(),
        role:    'assistant',
        content: response,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setMessages(prev => [...prev, {
        id:      'error_' + Date.now(),
        role:    'assistant',
        content: 'Sorry, I couldn\'t process that. Please try again.',
      }])
    } finally {
      setSending(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [input, sending])

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.heading}>Health Chat</Text>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.aiBubble]}>
            <Text style={[s.bubbleText, item.role === 'user' ? s.userText : s.aiText]}>
              {item.content}
            </Text>
          </View>
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your health data…"
            placeholderTextColor="#4b5563"
            multiline
            returnKeyType="send"
            onSubmitEditing={send}
          />
          {sending ? (
            <ActivityIndicator style={s.sendBtn} color="#60a5fa" />
          ) : (
            <TouchableOpacity style={s.sendBtn} onPress={send} disabled={!input.trim()}>
              <Send size={20} color={input.trim() ? '#60a5fa' : '#374151'} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0a0a0a' },
  heading:    { color: '#f9fafb', fontSize: 22, fontWeight: '700', padding: 20, paddingBottom: 8 },
  bubble:     { maxWidth: '85%', marginBottom: 10, padding: 12, borderRadius: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#1d4ed8' },
  aiBubble:   { alignSelf: 'flex-start', backgroundColor: '#1f2937' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  userText:   { color: '#eff6ff' },
  aiText:     { color: '#d1d5db' },
  inputRow:   { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#1f2937', backgroundColor: '#0a0a0a' },
  input:      { flex: 1, backgroundColor: '#111827', color: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn:    { marginLeft: 10, padding: 10 },
})
```

Add a `chat(text: string)` method to `HealthApiClient` in `lib/api.ts`:

```typescript
async chat(message: string): Promise<string> {
  // Health-governed endpoint — hard topic guardrails, de-identified user data in context.
  // Never use /api/chat or /api/chat/stream here — those have no health governance.
  const data = await this.post<{ content?: string; error?: string }>('/api/health/chat/stream', {
    messages: [{ role: 'user', content: message }],
  })
  if (typeof data.content === 'string') return data.content
  throw new Error(data.error ?? 'Chat failed')
}
```

---

## Step 8: Mobile — Push Registration in App Layout

### 8.1 — Update `apps/health-mobile/app/_layout.tsx`

Call `registerPushToken()` on authenticated startup. Add after the existing auth check:

```typescript
// In _layout.tsx, after confirming user is authenticated, add:
import { registerPushToken } from '@/lib/push'

// Inside the authenticated branch, fire-and-forget:
useEffect(() => {
  if (token) {
    void registerPushToken()
  }
}, [token])
```

Do not rewrite `_layout.tsx` — add only the import and the useEffect call.

---

## Step 9: Update `apps/health-mobile/package.json`

Add new dependencies to the existing Phase 4 `package.json`:

```json
"expo-camera":              "~14.1.0",
"expo-image-picker":        "~15.0.0",
"expo-notifications":       "~0.28.0",
"@gorhom/bottom-sheet":     "^5.0.0",
"react-native-svg":         "15.2.0"
```

---

## Validation Checklist

Before marking Phase 5 complete, verify every item:

### Backend
- [ ] `POST /api/health/upload/ocr` returns `{ id, documentType, confidence, pageCount, pngPages }` for a JPEG lab result
- [ ] `POST /api/health/upload/ocr` returns same shape for a text-based PDF lab result (no Vision call, extracts via `pdf.ts`)
- [ ] `POST /api/health/upload/ocr` returns 422 with scanned-PDF message when a PDF with no text layer is uploaded
- [ ] `POST /api/health/push/register` with a valid Expo token returns `{ registered: true }`
- [ ] `DELETE /api/health/push/register` sets `active = false` in `push_tokens`
- [ ] `POST /api/health/push/notify` (with cron secret header) delivers push to registered token
- [ ] `POST /api/cron/health-push-digest` (with digest secret) returns `{ sent: N, failed: 0 }` for users with active tokens
- [ ] All new routes have `export const runtime = 'nodejs'`
- [ ] All routes call `logPhiAccess` for any OCR/snapshot access
- [ ] OCR result goes through `deidentifyObject` before storage
- [ ] Duplicate OCR (same `payload_hash`) returns 409

### Mobile
- [ ] Camera permission prompt appears on first use
- [ ] Photographing a lab result produces a `documentType: 'lab_result'` snapshot within ~10 seconds
- [ ] Photographing an ICD TIFF produces `pngPages` array visible in `TiffViewer`
- [ ] `UploadSheet` bottom sheet opens, shows 3 options, dismisses correctly
- [ ] `Timeline` tab lists all snapshot types with correct labels
- [ ] Tapping an ICD report row opens `TiffViewer` modal
- [ ] `Chat` tab sends a message and receives Health Monitor response
- [ ] Push token is registered on login (visible in `push_tokens` table)
- [ ] Monday cron sends a push notification to the registered device
- [ ] TypeScript builds with `npx tsc --noEmit` from `apps/health-mobile/`

### No regressions
- [ ] Existing Garmin sync cron (`/api/cron/health-garmin-sync`) still runs without error
- [ ] Existing weekly checkup cron (`/api/cron/health-checkup`) still produces `checkup_result` snapshots
- [ ] Web dashboard still renders health data correctly (no schema changes)
- [ ] `GET /api/health/snapshots` returns OCR-produced snapshots in timeline

---

## Error Cases and Edge Cases

| Scenario | Expected behavior |
|----------|-------------------|
| Vision API returns non-JSON text | `extractFromImage` catches parse error, returns `documentType: 'unknown'`, `payload: null`; OCR route returns 422 |
| TIFF with 0 pages after conversion | `convertTiffToPng` throws; OCR route returns 500 with error message |
| TIFF with 10+ pages | All pages stored as PNG in Storage; `pngPages` array has all paths; OCR runs only on page 1 |
| No vision-capable provider in user account | `selectVisionProvider` falls back to first provider; Vision call likely fails with 400; OCR returns 422 |
| PDF with text layer (lab portal, MyChart export) | `extractPdfText` returns `hasText: true`; `extractFromText` parses to `LabResultPayload`; no Vision call made |
| PDF with no text layer (scanned image PDF) | `extractPdfText` returns `hasText: false`; OCR route returns 422 with message advising user to photograph directly |
| PDF that is password-protected or corrupt | `extractPdfText` catches error and returns `{ hasText: false }`; OCR route returns 422 same as scanned path |
| Push token already registered (duplicate) | `onConflictDoUpdate` sets `active: true`; returns 200 `{ registered: true }` |
| User has no checkup_result on digest day | Cron skips that user (no push sent); no error logged |
| User uninstalls app | Token remains in DB with `active: true` until `DELETE /api/health/push/register` or Expo returns `DeviceNotRegistered` receipt |
| Camera permission denied + no library access | `CameraOCR` shows "Camera permission required" screen with library fallback option |

---

## Why These Decisions Were Made

### Why OCR runs server-side (not on-device)

Running OCR on-device with a local model (e.g., Tesseract) produces poor accuracy on handwritten clinical notes and printed lab reports with logos. The Vision API approach costs ~$0.01/image and achieves high accuracy on printed medical documents. The tradeoff (requires network) is acceptable for a document scanning workflow where the user is already uploading a file.

### Why push uses Expo's push service (not direct FCM)

Direct FCM requires maintaining a Firebase service account key, handling token lifecycle, and building separate APNS integration for iOS. Expo's push service abstracts all of this. The `ExponentPushToken[...]` format works on both Android and iOS without platform-specific code.

### Why the digest runs at 8:15 AM (not 8:00 AM)

The `health-checkup` cron runs at 8:00 AM Monday and produces the `checkup_result` snapshot. The digest reads that snapshot. Running at 8:15 gives the checkup cron 15 minutes to complete for all users before the digest reads the results.

### Why chat uses the non-streaming endpoint in Phase 5

Consuming SSE streams in React Native requires `fetch` with `ReadableStream`, which has limited support across React Native versions. The non-streaming endpoint is simpler and reliable. Phase 6 can add streaming once the team validates the `react-native-fetch-api` polyfill on target devices.

### Why `TiffViewer` uses public bucket URLs (not signed URLs)

Signed URL generation requires a server round-trip for each page. For a diagnostic image viewer where the user has already authenticated to see the snapshot, public bucket URLs with RLS-enforced Storage policies are acceptable. If the bucket policy is set to "authenticated only", swap to a signed URL generation endpoint.
