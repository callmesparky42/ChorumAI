export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { healthDb } from '@/db/health'
import { healthSnapshots, garminSyncState } from '@/db/health-schema'
import { decryptPHI, encryptPHI, hashPHI } from '@/lib/health/crypto'
import { logPhiAccess } from '@/lib/health/audit'
import { deidentifyObject } from '@/lib/health/deidentify'
import { buildHealthTemporalBlock, deriveTemporalContext } from '@/lib/health/temporal'
import { callProvider } from '@/lib/providers'
import { getUserProviders } from '@/lib/agents/provider-configs'
import { selectHealthProvider } from '@/lib/health/health-chat'
import { db } from '@/db'
import { learnings, personas } from '@/db/schema'
import { eq, and, gte, desc } from 'drizzle-orm'

const CHECKUP_WINDOW_DAYS = 7

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.GARMIN_CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch Health Monitor persona from core DB
  const [healthPersona] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.name, 'Health Monitor'), eq(personas.isSystem, true)))
    .limit(1)

  if (!healthPersona) {
    console.error('[health-checkup] Health Monitor persona not found — run migration 0012_health_persona.sql')
    return NextResponse.json({ error: 'Health Monitor persona not seeded' }, { status: 500 })
  }

  // Find users with health snapshots in the past 7 days
  const since = new Date(Date.now() - CHECKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const weekStarting = since.toISOString().split('T')[0]!

  const recentUsers = await healthDb
    .selectDistinct({ userId: healthSnapshots.userId })
    .from(healthSnapshots)
    .where(gte(healthSnapshots.recordedAt, since))

  const results: Array<{ userId: string; status: string; anomalies?: number }> = []

  const now = new Date()

  for (const { userId } of recentUsers) {
    try {
      const [rows, garminRows] = await Promise.all([
        healthDb
          .select()
          .from(healthSnapshots)
          .where(and(eq(healthSnapshots.userId, userId), gte(healthSnapshots.recordedAt, since)))
          .orderBy(desc(healthSnapshots.recordedAt))
          .limit(50),
        healthDb
          .select({ lastSyncAt: garminSyncState.lastSyncAt })
          .from(garminSyncState)
          .where(eq(garminSyncState.userId, userId))
          .limit(1),
      ])

      await logPhiAccess({ userId, actorId: 'system', action: 'view', resourceType: 'snapshot' })

      // Decrypt + de-identify with relative age labels — PHI never reaches the LLM
      const deidentifiedLines: string[] = []
      for (const row of rows) {
        try {
          const raw = decryptPHI(row.encryptedPayload, row.payloadIv)
          const clean = deidentifyObject({ type: row.type, source: row.source, data: raw })
          const ageMs = now.getTime() - row.recordedAt.getTime()
          const ageDays = Math.floor(ageMs / 86_400_000)
          const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`
          deidentifiedLines.push(`[${ageLabel}] ${row.type}: ${JSON.stringify(clean)}`)
        } catch {
          // Skip corrupted records
        }
      }

      if (deidentifiedLines.length === 0) {
        results.push({ userId, status: 'skipped:no_data' })
        continue
      }

      // Get user's provider config for LLM call
      const userProviders = await getUserProviders(userId)
      const selectedProvider = selectHealthProvider(userProviders)
      if (!selectedProvider) {
        results.push({ userId, status: 'skipped:no_provider' })
        continue
      }

      // Build temporal context header
      const lastGarminSync = garminRows[0]?.lastSyncAt ?? null
      const temporalCtx = deriveTemporalContext(
        rows.map(r => ({ recordedAt: r.recordedAt, type: r.type })),
        lastGarminSync,
        now,
      )
      const temporalBlock = buildHealthTemporalBlock(temporalCtx)

      // Call Health Monitor persona with de-identified data + temporal context
      const dataBlock = deidentifiedLines.join('\n')
      const prompt = `${temporalBlock}\n\nAnalyze the following de-identified health data from the past ${CHECKUP_WINDOW_DAYS} days. Identify trends, flag anomalies vs reference ranges, and summarize findings concisely.\n\n${dataBlock}`
      const llmResult = await callProvider(
        selectedProvider,
        [{ role: 'user', content: prompt }],
        healthPersona.systemPrompt,
      )
      const analysisText = llmResult.content ?? ''

      // Count anomaly signals in the response (heuristic)
      const anomalyMatches = analysisText.match(/anomal|flag|alert|out.of.range|elevated|low/gi)
      const anomalyCount = anomalyMatches?.length ?? 0

      // Create a learning signal when anomalies were detected
      if (anomalyCount > 0) {
        await db.insert(learnings).values({
          userId,
          content: `Weekly checkup flagged ${anomalyCount} potential anomalies. Review health dashboard.`,
          type: 'health_alert',
          extractionMethod: 'auto',
          confidenceBase: 0.8,
          confidence: 0.8,
        })
      }

      // Store checkup result as a snapshot for history
      const checkupPayload = {
        weekStarting,
        snapshotsAnalyzed: deidentifiedLines.length,
        anomaliesFound: anomalyCount,
        summaryNote: analysisText.substring(0, 500),
      }
      const encrypted = encryptPHI(checkupPayload)
      const hash = hashPHI(checkupPayload)

      await healthDb
        .insert(healthSnapshots)
        .values({
          userId,
          type:             'checkup_result',
          recordedAt:       new Date(),
          source:           'system',
          encryptedPayload: encrypted.ciphertext,
          payloadIv:        encrypted.iv,
          payloadHash:      hash,
        })
        .onConflictDoNothing()

      results.push({ userId, status: 'ok', anomalies: anomalyCount })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[health-checkup] Failed for user ${userId}: ${msg}`)
      results.push({ userId, status: `error:${msg}` })
    }
  }

  return NextResponse.json({ ok: true, processed: recentUsers.length, results })
}
