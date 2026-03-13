// src/lib/health/garmin-transformer.ts
// Normalizes raw Garmin API responses to @chorum/health-types shapes.
// All field access is defensive — Garmin changes response shapes without notice.

import type { GarminDailyPayload, GarminHRVPayload } from '@chorum/health-types'

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safeNumber(v: unknown, fallback: number | null = null): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (isFinite(n)) return n
  }
  return fallback
}

function safeString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

/**
 * Transform a raw Garmin daily summary response to GarminDailyPayload.
 *
 * Handles two known Garmin API response shapes:
 * - v1: flat object with `calendarDate`, `averageHeartRateInBeatsPerMinute`, etc.
 * - v2: wrapped in `dailySummary` key, sometimes uses shorter field names
 *
 * Returns null if the response is malformed beyond recovery (missing date).
 */
export function transformGarminDaily(raw: unknown): GarminDailyPayload | null {
  if (!isRecord(raw)) return null

  // Garmin sometimes wraps in a `dailySummary` key
  const data = isRecord(raw['dailySummary']) ? raw['dailySummary'] : raw

  const date = safeString(data['calendarDate'] ?? data['startTimeLocal'])
  if (!date) return null   // date is the primary key — reject if missing

  // Normalize sleepingSeconds → minutes if present
  const sleepSecondsRaw = data['sleepingSeconds']
  const sleepMinutes = sleepSecondsRaw != null
    ? (() => {
        const secs = safeNumber(sleepSecondsRaw)
        return secs !== null ? Math.round(secs / 60) : null
      })()
    : safeNumber(data['sleepDurationMinutes'])

  return {
    date,
    heartRateAvgBpm:      safeNumber(data['averageHeartRateInBeatsPerMinute'] ?? data['averageHeartRate']),
    heartRateRestingBpm:  safeNumber(data['restingHeartRateInBeatsPerMinute'] ?? data['restingHeartRate']),
    heartRateMaxBpm:      safeNumber(data['maxHeartRateInBeatsPerMinute'] ?? data['maxHeartRate']),
    stepsTotal:           safeNumber(data['totalSteps'] ?? data['steps']),
    activeCalories:       safeNumber(data['activeKilocalories'] ?? data['activeCalories']),
    totalCalories:        safeNumber(data['totalKilocalories'] ?? data['totalCalories']),
    distanceMeters:       safeNumber(data['totalDistanceInMeters'] ?? data['distanceInMeters']),
    sleepDurationMinutes: sleepMinutes,
    sleepScore:           safeNumber(data['sleepScore'] ?? data['averageSleepStress']),
    stressAvg:            safeNumber(data['averageStressLevel'] ?? data['averageStress']),
    bodyBatteryEnd:       safeNumber(data['bodyBatteryMostRecentValue'] ?? data['bodyBatteryEnd']),
  }
}

/**
 * Transform a raw Garmin HRV summary response to GarminHRVPayload.
 *
 * Returns null if the response lacks any usable HRV data (both weeklyAvg
 * and lastNight missing), or if date is absent.
 */
export function transformGarminHRV(raw: unknown): GarminHRVPayload | null {
  if (!isRecord(raw)) return null

  // Garmin nests HRV data differently across versions
  const data = isRecord(raw['hrvSummary']) ? raw['hrvSummary']
             : isRecord(raw['hrv'])        ? raw['hrv']
             : raw

  const date = safeString(data['calendarDate'] ?? data['startTimestampLocal'])
  if (!date) return null

  const weeklyAvg = safeNumber(data['weeklyAvg'] ?? data['hrvWeeklyAverage'])
  const lastNight = safeNumber(data['lastNight'] ?? data['hrvLastNight'])

  if (weeklyAvg === null && lastNight === null) return null   // no usable HRV data

  return {
    date,
    hrvRmssdMs:   safeNumber(data['lastNightFive'] ?? data['lastNightAvg'] ?? lastNight),
    hrvWeeklyAvg: weeklyAvg,
    hrvLastNight: lastNight,
    hrvStatus:    safeString(data['status'] ?? data['hrvStatus']),
  }
}
