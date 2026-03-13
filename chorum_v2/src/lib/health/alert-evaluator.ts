// src/lib/health/alert-evaluator.ts
// Evaluates user-defined alert thresholds against freshly synced health data.
// Called at the end of each Garmin sync run (garmin-sync.ts) for the synced user.
//
// Thresholds are stored as JSON in health_user_settings.alertThresholds.
// When a threshold is crossed, fires the push notify endpoint.
//
// Example threshold config:
// {
//   "restingHr": { "gt": 90, "consecutive": 3 },
//   "hrv":       { "pctDropBelow30DayBaseline": 20 },
//   "steps":     { "lt": 2000, "consecutive": 5 }
// }

import { healthDb }      from '@/db/health'
import { healthSnapshots, healthUserSettings } from '@/db/health-schema'
import { decryptPHI }    from '@/lib/health/crypto'
import { eq, desc }      from 'drizzle-orm'
import type { GarminDailyPayload, GarminHRVPayload } from '@chorum/health-types'

// ---------------------------------------------------------------------------
// Threshold schema types
// ---------------------------------------------------------------------------

export interface AlertThresholds {
  restingHr?: { gt?: number; consecutive?: number }
  hrv?:       { pctDropBelow30DayBaseline?: number }
  steps?:     { lt?: number; consecutive?: number }
  sleepMins?: { lt?: number; consecutive?: number }
}

export interface AlertFired {
  metric:  string
  message: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate alert thresholds for a user after a sync.
 * Returns any alerts that fired so the caller can push-notify.
 * Never throws — returns empty array on any error.
 */
export async function evaluateAlerts(userId: string): Promise<AlertFired[]> {
  try {
    const [settings] = await healthDb
      .select()
      .from(healthUserSettings)
      .where(eq(healthUserSettings.userId, userId))
      .limit(1)

    const rawThresholds = settings?.alertThresholds
    const thresholds = (() => {
      if (!rawThresholds) return undefined
      if (typeof rawThresholds !== 'string') return undefined
      try {
        const parsed = JSON.parse(rawThresholds) as unknown
        return typeof parsed === 'object' && parsed !== null
          ? parsed as AlertThresholds
          : undefined
      } catch {
        return undefined
      }
    })()

    if (!thresholds) return []

    // Pull last 30 days of Garmin daily data for consecutive-day checks
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rows  = await healthDb
      .select()
      .from(healthSnapshots)
      .where(eq(healthSnapshots.userId, userId))
      .orderBy(desc(healthSnapshots.recordedAt))
      .limit(60)

    const dailyPayloads: GarminDailyPayload[] = []
    const hrvPayloads:   GarminHRVPayload[]   = []

    for (const row of rows) {
      try {
        const p = decryptPHI(row.encryptedPayload, row.payloadIv)
        if (row.type === 'garmin_daily') dailyPayloads.push(p as GarminDailyPayload)
        if (row.type === 'garmin_hrv')   hrvPayloads.push(p as GarminHRVPayload)
      } catch { /* skip corrupted */ }
    }

    const alerts: AlertFired[] = []

    // --- Resting HR threshold ---
    if (thresholds.restingHr?.gt !== undefined) {
      const threshold    = thresholds.restingHr.gt
      const consecutive  = thresholds.restingHr.consecutive ?? 1
      const recentValues = dailyPayloads
        .slice(0, consecutive)
        .map(p => p.heartRateRestingBpm)
        .filter((v): v is number => v !== null)

      if (recentValues.length >= consecutive && recentValues.every(v => v > threshold)) {
        alerts.push({
          metric:  'restingHr',
          message: `Resting HR above ${threshold} bpm for ${consecutive} consecutive day${consecutive > 1 ? 's' : ''} (latest: ${recentValues[0]} bpm)`,
        })
      }
    }

    // --- HRV drop vs. 30-day baseline ---
    if (thresholds.hrv?.pctDropBelow30DayBaseline !== undefined && hrvPayloads.length > 1) {
      const pctThreshold = thresholds.hrv.pctDropBelow30DayBaseline
      const values       = hrvPayloads.map(p => p.hrvRmssdMs).filter((v): v is number => v !== null)

      if (values.length >= 7) {
        const baseline = values.slice(1).reduce((s, v) => s + v, 0) / (values.length - 1)
        const latest   = values[0]!
        const pctDrop  = ((baseline - latest) / baseline) * 100

        if (pctDrop >= pctThreshold) {
          alerts.push({
            metric:  'hrv',
            message: `HRV dropped ${Math.round(pctDrop)}% below 30-day baseline (${Math.round(latest)} ms vs avg ${Math.round(baseline)} ms)`,
          })
        }
      }
    }

    // --- Steps threshold ---
    if (thresholds.steps?.lt !== undefined) {
      const threshold   = thresholds.steps.lt
      const consecutive = thresholds.steps.consecutive ?? 1
      const recentValues = dailyPayloads
        .slice(0, consecutive)
        .map(p => p.stepsTotal)
        .filter((v): v is number => v !== null)

      if (recentValues.length >= consecutive && recentValues.every(v => v < threshold)) {
        alerts.push({
          metric:  'steps',
          message: `Steps below ${threshold.toLocaleString()} for ${consecutive} consecutive day${consecutive > 1 ? 's' : ''} (latest: ${recentValues[0]?.toLocaleString()})`,
        })
      }
    }

    // --- Sleep duration threshold ---
    if (thresholds.sleepMins?.lt !== undefined) {
      const threshold   = thresholds.sleepMins.lt
      const consecutive = thresholds.sleepMins.consecutive ?? 1
      const recentValues = dailyPayloads
        .slice(0, consecutive)
        .map(p => p.sleepDurationMinutes)
        .filter((v): v is number => v !== null)

      if (recentValues.length >= consecutive && recentValues.every(v => v < threshold)) {
        const hrs = Math.round(threshold / 60 * 10) / 10
        alerts.push({
          metric:  'sleep',
          message: `Sleep under ${hrs}h for ${consecutive} consecutive night${consecutive > 1 ? 's' : ''} (latest: ${Math.round((recentValues[0] ?? 0) / 60 * 10) / 10}h)`,
        })
      }
    }

    return alerts
  } catch {
    return []
  }
}
