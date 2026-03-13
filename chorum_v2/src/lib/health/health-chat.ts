// src/lib/health/health-chat.ts
// System prompt and data context builder for the Health Monitor chat agent.
//
// Design contract:
//   - Topic scope is locked: health, nutrition, fitness, and medical information ONLY.
//   - Any off-topic request receives an explicit refusal — no drift, no exceptions.
//   - User health data is injected de-identified into the system prompt per-request.
//   - The agent never speculates on diagnosis — always ends clinical findings with
//     "Discuss with your care team."
//   - This module does NOT use the Conductor, personas table, or learning system.
//     It is a purpose-built, governed agent with a hardcoded identity.

import { healthDb }         from '@/db/health'
import { healthSnapshots, garminSyncState }  from '@/db/health-schema'
import { decryptPHI }       from '@/lib/health/crypto'
import { deidentifyObject } from '@/lib/health/deidentify'
import { buildHealthTemporalBlock, deriveTemporalContext, formatSnapshotAge } from '@/lib/health/temporal'
import { eq, and, gte, desc } from 'drizzle-orm'
import type { FullProviderConfig } from '@/lib/providers'
import type { ProviderConfig } from '@/lib/agents/provider-configs'

// ---------------------------------------------------------------------------
// Provider selection — prefers claude-sonnet-4-6 for clinical reasoning quality.
// Falls back to the first enabled provider the user has configured.
// ---------------------------------------------------------------------------

const PREFERRED_MODELS_ORDERED = [
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-3-5-sonnet-20241022',
  'gpt-4o',
  'gemini-1.5-pro',
]

export function selectHealthProvider(providers: ProviderConfig[]): FullProviderConfig | null {
  const enabled = providers.filter(p => p.isEnabled)
  if (enabled.length === 0) return null

  for (const preferredModel of PREFERRED_MODELS_ORDERED) {
    const match = enabled.find(p =>
      (p.modelOverride ?? '').toLowerCase() === preferredModel ||
      p.provider === 'anthropic' && preferredModel.startsWith('claude')
    )
    if (match) {
      return {
        provider:  match.provider,
        apiKey:    match.apiKey,
        model:     match.modelOverride ?? preferredModel,
        ...(match.baseUrl ? { baseUrl: match.baseUrl } : {}),
      }
    }
  }

  // Last resort: first enabled provider with its default model
  const fallback = enabled[0]!
  return {
    provider: fallback.provider,
    apiKey:   fallback.apiKey,
    model:    fallback.modelOverride ?? 'auto',
    ...(fallback.baseUrl ? { baseUrl: fallback.baseUrl } : {}),
  }
}

// ---------------------------------------------------------------------------
// System prompt — the governance contract.
// ---------------------------------------------------------------------------

export const HEALTH_MONITOR_SYSTEM_PROMPT = `You are the Health Monitor — a personal health analyst embedded in Chorum Health. Think of yourself as a knowledgeable friend who has been reading this person's chart for years: honest, direct, occasionally dry, and genuinely invested in their outcomes.

## Your scope — non-negotiable

You discuss health, nutrition, fitness, and medical topics. That's it. When a question falls clearly outside that — ask yourself: does this have a plausible connection to the body, longevity, or how someone feels physically? If not, it's out of scope.

When someone asks you something off-topic, don't lecture them. Just redirect with a short, slightly pointed observation. Something like: "That's not something I cover. Though if you want to know why your resting HR spiked last Tuesday, I have thoughts." Adapt to context — match the energy. If they're frustrated, be direct. If they're curious, be engaging.

The one thing you will not do is drift. You will not write code, explain geopolitics, draft emails, solve math problems, or discuss anything that has no bearing on physical health. If someone is creative about framing an off-topic request as a health question, call it out.

## How to read the health context

The <health_context> block below contains two layers of de-identified data:

**Layer 1 — Recent dynamic data** (last 14 days): Garmin metrics, vitals, HRV. This is what the body is doing right now. Look for deviations from the historical baseline.

**Layer 2 — Historical static data** (full history): Lab panels, ICD reports, MyChart uploads. This is the longitudinal record. A single lipid panel means little. Five years of them, cross-referenced with recent activity and sleep trends, means a lot.

When both layers are present, your job is to connect them. A metabolic panel from three months ago combined with two weeks of low step counts and poor sleep is a story. Tell it.

## Hard rules

- Flag anything outside standard clinical reference ranges. End that specific point with **→ Discuss with your care team.**
- Do not suggest a specific diagnosis
- Do not recommend starting, stopping, or changing any medication
- Do not treat a single data point as a trend — context is everything
- When you're uncertain, say so directly. "I don't have enough data to say" is a complete and honest answer
- Never reference identifying information — the data is de-identified; keep it that way

## Format

- Use markdown when presenting multiple data points or comparisons
- Always include units (bpm, ms, mg/dL, mmol/L, minutes, etc.)
- Short answers for simple questions. Longer structured analysis when the data warrants it
- Numbers first, interpretation second`

// ---------------------------------------------------------------------------
// Lab annotation — pre-flags out-of-range values before LLM injection.
// The LLM sees "⚠ LDL-C: 178 mg/dL [ref: <130] FLAG:H" rather than raw JSON,
// making it dramatically more reliable at catching clinical findings.
// ---------------------------------------------------------------------------

interface LabValueRaw {
  name?:         unknown
  value?:        unknown
  unit?:         unknown
  flag?:         unknown
  referenceMin?: unknown
  referenceMax?: unknown
}

function annotateLabs(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return JSON.stringify(payload)

  const p      = payload as Record<string, unknown>
  const panel  = typeof p['panelName'] === 'string' ? p['panelName'] : 'Lab Panel'
  const values = Array.isArray(p['values']) ? p['values'] as LabValueRaw[] : []
  const lines: string[] = [`Panel: ${panel}`]

  for (const v of values) {
    if (typeof v.name !== 'string' || typeof v.value !== 'number') continue
    const unit   = typeof v.unit === 'string' ? ` ${v.unit}` : ''
    const refMin = typeof v.referenceMin === 'number' ? v.referenceMin : null
    const refMax = typeof v.referenceMax === 'number' ? v.referenceMax : null
    const flag   = typeof v.flag === 'string' && v.flag ? v.flag : null

    let ref = ''
    if (refMin !== null && refMax !== null) ref = ` [ref: ${refMin}–${refMax}]`
    else if (refMax !== null)               ref = ` [ref: <${refMax}]`
    else if (refMin !== null)               ref = ` [ref: >${refMin}]`

    const isOutOfRange = flag !== null
      || (refMax !== null && v.value > refMax)
      || (refMin !== null && v.value < refMin)

    const prefix = isOutOfRange ? '  ⚠ ' : '    '
    const flagStr = flag ? ` FLAG:${flag}` : ''
    lines.push(`${prefix}${v.name}: ${v.value}${unit}${ref}${flagStr}`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Dynamic types: high-frequency, recent window matters most
const DYNAMIC_TYPES = new Set(['garmin_daily', 'garmin_hrv', 'vitals'])
// Static types: low-frequency, full history matters — pull all available
const STATIC_TYPES  = new Set(['labs', 'icd_report', 'mychart', 'checkup_result'])

const CONTEXT_DAYS     = 14   // dynamic data window
const MAX_DYNAMIC      = 20   // cap recent Garmin/vitals rows
const MAX_STATIC       = 40   // cap historical lab/report rows (can span years)

export interface HealthContextResult {
  contextBlock:  string
  dynamicCount:  number
  staticCount:   number
}

export async function buildHealthContext(userId: string): Promise<HealthContextResult> {
  const now   = new Date()
  const since = new Date(now.getTime() - CONTEXT_DAYS * 24 * 60 * 60 * 1000)

  // Fetch in parallel: dynamic snapshots, all rows for static filtering, last Garmin sync
  const [dynamicRows, allRows, garminRows] = await Promise.all([
    healthDb
      .select()
      .from(healthSnapshots)
      .where(and(
        eq(healthSnapshots.userId, userId),
        gte(healthSnapshots.recordedAt, since),
      ))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(MAX_DYNAMIC),
    healthDb
      .select()
      .from(healthSnapshots)
      .where(eq(healthSnapshots.userId, userId))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(200),
    healthDb
      .select({ lastSyncAt: garminSyncState.lastSyncAt })
      .from(garminSyncState)
      .where(eq(garminSyncState.userId, userId))
      .limit(1),
  ])

  const staticRows = allRows.filter(r => STATIC_TYPES.has(r.type)).slice(0, MAX_STATIC)
  const lastGarminSync = garminRows[0]?.lastSyncAt ?? null

  // Build temporal context from all rows visible to this call
  const allVisible = [...dynamicRows, ...staticRows]
  const temporalCtx = deriveTemporalContext(
    allVisible.map(r => ({ recordedAt: r.recordedAt, type: r.type })),
    lastGarminSync,
    now,
  )
  const temporalBlock = buildHealthTemporalBlock(temporalCtx)

  function decryptRow(row: typeof allRows[number]): string | null {
    try {
      const raw   = decryptPHI(row.encryptedPayload, row.payloadIv)
      const clean = deidentifyObject({ type: row.type, source: row.source, data: raw })
      // Use relative time instead of absolute date — HIPAA-compatible, model-legible
      const age   = formatSnapshotAge(row.recordedAt, now)

      // For lab snapshots, pre-annotate out-of-range values so the LLM catches
      // every flag without needing to re-derive comparisons from reference ranges.
      if (row.type === 'labs') {
        const annotated = annotateLabs(clean)
        return `[${age}] labs:\n${annotated}`
      }

      return `[${age}] ${row.type}: ${JSON.stringify(clean)}`
    } catch {
      return null
    }
  }

  const dynamicEntries = dynamicRows
    .filter(r => DYNAMIC_TYPES.has(r.type))
    .map(decryptRow)
    .filter((e): e is string => e !== null)

  const staticEntries = staticRows
    .map(decryptRow)
    .filter((e): e is string => e !== null)
    // Reverse so entries are chronological (oldest first) — important for trend reading
    .reverse()

  if (dynamicEntries.length === 0 && staticEntries.length === 0) {
    return {
      contextBlock: `${temporalBlock}\n\n<health_context>\nNo health data available yet.\n</health_context>`,
      dynamicCount: 0,
      staticCount:  0,
    }
  }

  const sections: string[] = [temporalBlock, '', '<health_context>']

  if (dynamicEntries.length > 0) {
    sections.push(`## Recent activity (last ${CONTEXT_DAYS} days — ${dynamicEntries.length} records)`)
    sections.push(...dynamicEntries)
  } else {
    sections.push(`## Recent activity (last ${CONTEXT_DAYS} days)\nNo recent Garmin or vitals data.`)
  }

  if (staticEntries.length > 0) {
    sections.push('')
    sections.push(`## Historical records (${staticEntries.length} records — oldest to newest)`)
    sections.push(...staticEntries)
  }

  sections.push('</health_context>')

  return {
    contextBlock: sections.join('\n'),
    dynamicCount: dynamicEntries.length,
    staticCount:  staticEntries.length,
  }
}

// ---------------------------------------------------------------------------
// Full system prompt with injected data context
// ---------------------------------------------------------------------------

export function buildSystemPrompt(contextBlock: string): string {
  return `${HEALTH_MONITOR_SYSTEM_PROMPT}\n\n${contextBlock}`
}
