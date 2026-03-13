// src/app/api/cron/health-longitudinal/route.ts
// Monthly longitudinal health analysis.
//
// Unlike the weekly checkup (which analyzes recent data in isolation),
// this cron correlates recent behavior against the full historical record.
// The question it answers: "Given everything we know going back years,
// what does the last 30 days actually mean?"
//
// Output is stored as a 'checkup_result' snapshot so it appears in the
// timeline and is available to the health chat agent as a prior analysis.
//
// Schedule: 1st of each month at 7:00 AM UTC.
export const runtime = 'nodejs'

import { NextRequest, NextResponse }       from 'next/server'
import { db }                              from '@/db'
import { personas }                        from '@/db/schema'
import { healthDb }                        from '@/db/health'
import { healthSnapshots, garminSyncState } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { deidentifyObject }                from '@/lib/health/deidentify'
import { logPhiAccess }                    from '@/lib/health/audit'
import { getUserProviders }                from '@/lib/agents/provider-configs'
import { callProvider }                    from '@/lib/providers'
import { selectHealthProvider }            from '@/lib/health/health-chat'
import { eq, desc, gte, and }             from 'drizzle-orm'

const RECENT_DAYS  = 30
const MAX_RECENT   = 60    // recent dynamic rows
const MAX_HISTORY  = 60    // historical static rows

const LONGITUDINAL_SYSTEM_PROMPT = `You are a clinical data analyst reviewing a longitudinal health record.
You will receive two data sets:
1. Recent activity: the last 30 days of wearable, vitals, and activity data
2. Historical record: years of lab panels, device reports, and prior health analyses

Your task:
- Identify correlations between recent behavior and long-term trends
- Flag values that have changed meaningfully over time — not just whether they're outside a reference range today, but whether they are trending in a direction
- Cross-reference: if recent activity metrics suggest reduced exercise, does the historical lipid data suggest this is a pattern with measurable consequences?
- Identify what is improving, what is stable, and what warrants attention
- Be specific about timeframes — "your LDL has increased 12% over 18 months" is useful; "your cholesterol is high" is not

Output format (JSON only — no markdown, no explanation outside the JSON):
{
  "summary": "2–3 sentence plain-language summary of the most important finding",
  "trends": [
    { "metric": "string", "direction": "improving|stable|declining|inconclusive", "detail": "string", "actionable": boolean }
  ],
  "correlations": [
    { "observation": "string", "supporting_data": "string" }
  ],
  "flags": [
    { "finding": "string", "severity": "info|watch|discuss_with_care_team" }
  ],
  "data_quality": "string"   // note on gaps, missing data, or insufficient history
}`

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.GARMIN_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all users who have any health data
  const userRows = await healthDb
    .selectDistinct({ userId: healthSnapshots.userId })
    .from(healthSnapshots)

  if (userRows.length === 0) return NextResponse.json({ processed: 0 })

  const results = await Promise.allSettled(
    userRows.map(({ userId }) => processUser(userId))
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ processed: userRows.length, succeeded, failed })
}

async function processUser(userId: string): Promise<void> {
  const recentSince = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000)

  // Recent dynamic data
  const recentRows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(and(
      eq(healthSnapshots.userId, userId),
      gte(healthSnapshots.recordedAt, recentSince),
    ))
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(MAX_RECENT)

  // Full historical record (labs, ICD, MyChart, prior longitudinal analyses)
  const allRows = await healthDb
    .select()
    .from(healthSnapshots)
    .where(eq(healthSnapshots.userId, userId))
    .orderBy(desc(healthSnapshots.recordedAt))
    .limit(500)

  const STATIC_TYPES = new Set(['labs', 'icd_report', 'mychart', 'checkup_result'])
  const historicalRows = allRows
    .filter(r => STATIC_TYPES.has(r.type))
    .slice(0, MAX_HISTORY)
    .reverse()  // chronological for trend reading

  function safeDecrypt(row: typeof allRows[number]): unknown {
    try {
      const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
      return deidentifyObject({ type: row.type, source: row.source, date: row.recordedAt.toISOString().split('T')[0]!, data: raw })
    } catch {
      return null
    }
  }

  const recentData    = recentRows.map(safeDecrypt).filter(Boolean)
  const historicalData = historicalRows.map(safeDecrypt).filter(Boolean)

  if (recentData.length === 0 && historicalData.length === 0) return

  // Get provider config
  const providers = await getUserProviders(userId)
  const provider  = selectHealthProvider(providers)
  if (!provider) return

  const userMessage = JSON.stringify({
    recent_activity:    { period_days: RECENT_DAYS, records: recentData },
    historical_record:  { records: historicalData },
  })

  const result = await callProvider(
    provider,
    [{ role: 'user', content: userMessage }],
    LONGITUDINAL_SYSTEM_PROMPT,
  )

  const rawText = typeof result === 'string' ? result : (result as { content?: string }).content ?? ''

  // Parse the LLM JSON output
  let analysisPayload: Record<string, unknown>
  try {
    const clean = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    analysisPayload = JSON.parse(clean) as Record<string, unknown>
  } catch {
    // If the model didn't return valid JSON, store the raw text as a summary
    analysisPayload = { summary: rawText.slice(0, 2000), parse_error: true }
  }

  // Tag it so the chat agent and dashboard can distinguish from weekly checkups
  analysisPayload['analysisType'] = 'longitudinal'
  analysisPayload['recentDays']   = RECENT_DAYS
  analysisPayload['historicalRecordCount'] = historicalData.length

  // Store as a checkup_result snapshot
  const hash      = hashPHI(analysisPayload)
  const encrypted = encryptPHI(analysisPayload)

  await healthDb
    .insert(healthSnapshots)
    .values({
      userId,
      type:             'checkup_result',
      recordedAt:       new Date(),
      source:           'system',
      encryptedPayload: encrypted.ciphertext,
      payloadIv:        `${encrypted.iv}:${encrypted.tag}`,
      payloadHash:      hash,
    })
    .onConflictDoNothing()

  await logPhiAccess({
    userId,
    actorId:      'system',
    action:       'create',
    resourceType: 'snapshot',
  })
}
