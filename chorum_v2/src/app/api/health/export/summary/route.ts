// src/app/api/health/export/summary/route.ts
// Generates a structured pre-visit clinical summary for provider appointments.
// Pulls the full health context (recent + historical), asks the LLM to produce
// a concise one-page summary suitable for a cardiologist or PCP, and returns it
// as markdown. The web dashboard renders this with a "Copy / Print" button;
// the mobile app exposes a share sheet.
//
// POST body: { days?: number }   — period to cover; default 30, max 90
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { authenticate }              from '@/lib/customization/auth'
import { getUserProviders }          from '@/lib/agents/provider-configs'
import { callProvider }              from '@/lib/providers'
import { checkRateLimit, rateLimitHeaders } from '@/lib/health/rate-limit'
import { logPhiAccess }              from '@/lib/health/audit'
import { buildHealthContext }        from '@/lib/health/health-chat'
import { selectHealthProvider }      from '@/lib/health/health-chat'

const SUMMARY_SYSTEM_PROMPT = `You are a clinical documentation assistant. Generate a concise pre-visit health summary for a patient to bring to a medical appointment.

The summary must be:
- One page when printed (aim for 400–600 words)
- Written for a clinical audience (physician, nurse practitioner, or cardiologist)
- Structured with clear sections
- Objective — present the data, flag trends, avoid speculation

Required sections:
## Recent Activity Summary (last N days)
Key metrics from wearable data: average HR, resting HR, HRV trend, sleep, steps. Note any deviations from the patient's own baseline.

## Lab & Clinical History
Summarize all available lab results chronologically. For each panel, list the most clinically significant values and whether they are trending up, down, or stable over time. Flag any values outside reference ranges.

## Device Data (if present)
ICD/pacemaker transmission summary: battery status, episode counts, arrhythmia burden.

## Patterns & Correlations
Note any cross-data correlations worth discussing (e.g., reduced activity preceding lipid changes, sleep disruption correlating with elevated HR).

## Items to Discuss with Care Team
Bullet list of specific findings that warrant clinical discussion. Be specific — include the metric, the value, and why it warrants discussion.

---
*This summary was generated from de-identified health data. Verify all values against original records before clinical use.*`

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Summary generation is expensive — tighter rate limit (reuse 'ocr' bucket: 20/hr)
  const rl = await checkRateLimit(auth.userId, 'ocr')
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    )
  }

  const body = await req.json().catch(() => ({})) as { days?: unknown }
  const days = typeof body.days === 'number'
    ? Math.min(Math.max(body.days, 7), 90)
    : 30

  const providers = await getUserProviders(auth.userId)
  const provider  = selectHealthProvider(providers)
  if (!provider) {
    return NextResponse.json({ error: 'No AI provider configured' }, { status: 503 })
  }

  const { contextBlock, dynamicCount, staticCount } = await buildHealthContext(auth.userId)

  if (dynamicCount === 0 && staticCount === 0) {
    return NextResponse.json({ error: 'No health data available to summarize' }, { status: 404 })
  }

  await logPhiAccess({ userId: auth.userId, actorId: auth.userId, action: 'view', resourceType: 'snapshot' })

  const userMessage = `Generate a pre-visit clinical summary covering the last ${days} days of recent data and the full available historical record.\n\n${contextBlock}`

  try {
    const result  = await callProvider(
      provider,
      [{ role: 'user', content: userMessage }],
      SUMMARY_SYSTEM_PROMPT,
    )
    const content = typeof result === 'string' ? result : (result as { content?: string }).content ?? ''

    return NextResponse.json({
      summary:       content,
      generatedAt:   new Date().toISOString(),
      periodDays:    days,
      snapshotsUsed: dynamicCount + staticCount,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Summary generation failed' },
      { status: 500 },
    )
  }
}
