// src/lib/health/ocr.ts
// Structured OCR extraction for health uploads.
// Uses user-configured provider credentials and returns de-identified text
// plus a normalized payload suitable for health snapshot storage.

import { callProvider, getDefaultBaseUrl } from '@/lib/providers'
import { getUserProviders } from '@/lib/agents/provider-configs'
import { deidentify, deidentifyObject } from '@/lib/health/deidentify'
import type { ProviderConfig } from '@/lib/agents/types'

export type OCRDocumentType = 'lab_result' | 'icd_report' | 'vitals' | 'unknown'

export interface OCRResult {
  documentType: OCRDocumentType
  payload: Record<string, unknown> | null
  rawText: string
  confidence: 'high' | 'medium' | 'low'
  pageCount: number
}

interface VisionProvider {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
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

For VITAL SIGNS:
{
  "documentType": "vitals",
  "confidence": "high"|"medium"|"low",
  "recordedAt": "YYYY-MM-DD",
  "systolicBP": number_or_null,
  "diastolicBP": number_or_null,
  "heartRate": number_or_null,
  "o2Sat": number_or_null,
  "temperatureF": number_or_null,
  "weightLbs": number_or_null,
  "bloodGlucose": number_or_null
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
- Output ONLY the JSON object - no markdown, no explanation.`

const VISION_MODEL_PREFERENCE = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022',
  'gpt-4o',
  'gpt-4-turbo',
  'gemini-1.5-pro',
] as const

const TEXT_MODEL_PREFERENCE = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-3-5-sonnet-20241022',
  'gpt-4o',
  'gemini-1.5-pro',
] as const

function defaultModelForProvider(provider: string): string {
  if (provider === 'anthropic') return 'claude-sonnet-4-6'
  if (provider === 'openai') return 'gpt-4o'
  if (provider === 'google') return 'gemini-1.5-pro'
  return 'auto'
}

function toVisionProvider(config: ProviderConfig): VisionProvider {
  const model = config.modelOverride ?? defaultModelForProvider(config.provider)
  return {
    provider: config.provider,
    apiKey: config.apiKey,
    model,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  }
}

function scoreModel(model: string, preference: readonly string[]): number {
  const normalized = model.toLowerCase()
  const idx = preference.findIndex((p) => p.toLowerCase() === normalized)
  return idx === -1 ? 999 : idx
}

function selectProvider(
  providers: ProviderConfig[],
  preference: readonly string[],
): VisionProvider | null {
  const enabled = providers.filter((p) => p.isEnabled)
  if (enabled.length === 0) return null

  const ranked = [...enabled].sort((a, b) => {
    const aScore = scoreModel(a.modelOverride ?? defaultModelForProvider(a.provider), preference)
    const bScore = scoreModel(b.modelOverride ?? defaultModelForProvider(b.provider), preference)
    if (aScore !== bScore) return aScore - bScore
    return a.priority - b.priority
  })

  return toVisionProvider(ranked[0]!)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string') return todayIsoDate()
  const trimmed = value.trim()
  if (!trimmed) return todayIsoDate()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
  return todayIsoDate()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim()
    if (!cleaned) return null
    const num = Number(cleaned)
    return Number.isFinite(num) ? num : null
  }
  return null
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function toFlag(value: unknown): 'H' | 'L' | 'HH' | 'LL' | null {
  if (value === 'H' || value === 'L' || value === 'HH' || value === 'LL') return value
  return null
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const clean = stripJsonFences(raw)
  try {
    const parsed = JSON.parse(clean) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1)) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    } catch {
      return null
    }
  }
}

function normalizeExtraction(
  parsed: Record<string, unknown>,
  rawText: string,
  pageCount: number,
): OCRResult {
  const safe = deidentifyObject(parsed) as Record<string, unknown>
  const documentType = (safe.documentType as OCRDocumentType | undefined) ?? 'unknown'
  const confidenceRaw = safe.confidence
  const confidence: OCRResult['confidence'] =
    confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
      ? confidenceRaw
      : 'low'

  if (documentType === 'lab_result') {
    const panelName = toText(safe.panelName, 'Unknown Panel')
    const reportDate = normalizeDate(safe.date)
    const labName = safe.labName === null ? null : toText(safe.labName, panelName)
    const valuesRaw = Array.isArray(safe.values) ? safe.values : []

    const values = valuesRaw
      .map((entry): Record<string, unknown> | null => {
        if (typeof entry !== 'object' || entry === null) return null
        const item = entry as Record<string, unknown>
        const name = toText(item.name)
        if (!name) return null
        const unit = toText(item.unit)
        const value = toNumber(item.value)
        const referenceMin = toNumber(item.referenceMin)
        const referenceMax = toNumber(item.referenceMax)
        const flag = toFlag(item.flag)
        return {
          name,
          value,
          unit,
          referenceMin,
          referenceMax,
          flag,
        }
      })
      .filter((item): item is Record<string, unknown> => item !== null)

    const results = values.map((item) => ({
      name: item.name as string,
      value: item.value as number | null,
      unit: item.unit as string,
      refRangeLow: item.referenceMin as number | null,
      refRangeHigh: item.referenceMax as number | null,
      flag: item.flag as 'H' | 'L' | 'HH' | 'LL' | null,
    }))

    return {
      documentType,
      payload: {
        reportDate,
        labName,
        orderingPhysician: null,
        results,
        // Compatibility with existing trend and dashboard code.
        panelName,
        date: reportDate,
        values,
      },
      rawText: deidentify(rawText),
      confidence,
      pageCount,
    }
  }

  if (documentType === 'icd_report') {
    const reportDate = normalizeDate(safe.reportDate)
    const batteryPct = toNumber(safe.batteryPercentage ?? safe.batteryPct)
    const nsVtEpisodes = toNumber(safe.nsvtCount ?? safe.nsVtEpisodes)
    const svtEpisodes = toNumber(safe.svtCount ?? safe.svtEpisodes)
    const atrialFibBurden = toNumber(safe.atrialFibBurden)
    const batteryStatus = toText(safe.batteryStatus)
    const ertIndicator = /ert/i.test(batteryStatus)

    return {
      documentType,
      payload: {
        reportDate,
        deviceModel: toText(safe.deviceModel, 'Unknown'),
        batteryPct,
        ertIndicator,
        nsVtEpisodes,
        svtEpisodes,
        atrialFibBurden,
        reviewerNotes: toText(safe.reviewerNotes),
        storagePages: [],
        // Compatibility aliases for OCR-focused UIs.
        batteryPercentage: batteryPct,
        nsvtCount: nsVtEpisodes,
        svtCount: svtEpisodes,
        pngPages: [],
      },
      rawText: deidentify(rawText),
      confidence,
      pageCount,
    }
  }

  if (documentType === 'vitals') {
    return {
      documentType,
      payload: {
        recordedAt: normalizeDate(safe.recordedAt),
        systolicBP: toNumber(safe.systolicBP),
        diastolicBP: toNumber(safe.diastolicBP),
        heartRate: toNumber(safe.heartRate),
        o2Sat: toNumber(safe.o2Sat),
        temperatureF: toNumber(safe.temperatureF),
        weightLbs: toNumber(safe.weightLbs),
        bloodGlucose: toNumber(safe.bloodGlucose),
      },
      rawText: deidentify(rawText),
      confidence,
      pageCount,
    }
  }

  return {
    documentType: 'unknown',
    payload: {
      source: 'ocr',
      rawText: deidentify(rawText),
      parsedFields: {},
    },
    rawText: deidentify(rawText),
    confidence: 'low',
    pageCount,
  }
}

async function callOpenAIVision(
  provider: VisionProvider,
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
  const baseUrl = (provider.baseUrl ?? getDefaultBaseUrl(provider.provider) ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const endpoint = `${baseUrl}/chat/completions`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: VISION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all structured health data from this document image.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Vision request failed (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> | null } }>
  }

  const content = json.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('\n')
  return ''
}

async function callAnthropicVision(
  provider: VisionProvider,
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
): Promise<string> {
  const baseUrl = (provider.baseUrl ?? getDefaultBaseUrl(provider.provider) ?? 'https://api.anthropic.com/v1').replace(/\/$/, '')
  const endpoint = `${baseUrl}/messages`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 2048,
      system: VISION_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBuffer.toString('base64'),
              },
            },
            { type: 'text', text: 'Extract all structured health data from this document image.' },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Vision request failed (${response.status}): ${body}`)
  }

  const json = await response.json() as { content?: Array<{ type?: string; text?: string }> }
  return (json.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

async function callGoogleVision(
  provider: VisionProvider,
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
): Promise<string> {
  const baseUrl = (provider.baseUrl ?? getDefaultBaseUrl(provider.provider) ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
  const endpoint = `${baseUrl}/models/${provider.model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: VISION_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Extract all structured health data from this document image.' },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Vision request failed (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('\n')
}

async function runVisionExtraction(
  provider: VisionProvider,
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
): Promise<string> {
  if (provider.provider === 'anthropic') {
    return callAnthropicVision(provider, imageBuffer, mimeType)
  }
  if (provider.provider === 'google') {
    return callGoogleVision(provider, imageBuffer, mimeType)
  }
  if (provider.provider === 'openai' || provider.provider === 'openai-compatible' || provider.provider === 'lmstudio' || provider.provider === 'xai' || provider.provider === 'glm' || provider.provider === 'deepseek' || provider.provider === 'mistral' || provider.provider === 'perplexity') {
    return callOpenAIVision(provider, imageBuffer, mimeType)
  }

  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
  const result = await callProvider(
    {
      provider: provider.provider,
      apiKey: provider.apiKey,
      model: provider.model,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
    },
    [{
      role: 'user',
      content: 'Extract all structured health data from this document image.',
      images: [dataUrl],
    }],
    VISION_PROMPT,
  )
  return result.content ?? ''
}

export async function extractFromImage(
  imageBuffer: Buffer,
  mimeType: 'image/jpeg' | 'image/png' | 'image/tiff',
  userId: string,
  pageCount = 1,
): Promise<OCRResult> {
  try {
    const providers = await getUserProviders(userId)
    const provider = selectProvider(providers, VISION_MODEL_PREFERENCE)
    if (!provider) {
      return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
    }

    const rawText = await runVisionExtraction(provider, imageBuffer, mimeType)
    const parsed = extractJsonObject(rawText)
    if (!parsed) {
      return {
        documentType: 'unknown',
        payload: {
          source: 'ocr',
          rawText: deidentify(rawText),
          parsedFields: {},
        },
        rawText: deidentify(rawText),
        confidence: 'low',
        pageCount,
      }
    }
    return normalizeExtraction(parsed, rawText, pageCount)
  } catch {
    return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
  }
}

export async function extractFromText(
  text: string,
  userId: string,
  pageCount = 1,
): Promise<OCRResult> {
  try {
    const providers = await getUserProviders(userId)
    const provider = selectProvider(providers, TEXT_MODEL_PREFERENCE)
    if (!provider) {
      return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
    }

    const result = await callProvider(
      {
        provider: provider.provider,
        apiKey: provider.apiKey,
        model: provider.model,
        ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      },
      [{
        role: 'user',
        content: `Extract all structured health data from the following document text.\n\n${text}`,
      }],
      VISION_PROMPT,
    )

    const rawText = result.content ?? ''
    const parsed = extractJsonObject(rawText)
    if (!parsed) {
      return {
        documentType: 'unknown',
        payload: {
          source: 'ocr',
          rawText: deidentify(rawText),
          parsedFields: {},
        },
        rawText: deidentify(rawText),
        confidence: 'low',
        pageCount,
      }
    }
    return normalizeExtraction(parsed, rawText, pageCount)
  } catch {
    return { documentType: 'unknown', payload: null, rawText: '', confidence: 'low', pageCount }
  }
}
