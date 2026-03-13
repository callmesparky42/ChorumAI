import {
  SdkAvailabilityStatus,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
} from 'react-native-health-connect'
import type { GarminDailyPayload } from '@chorum/health-types'

import { healthApi } from '@/lib/api'

const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'HeartRate' } as const,
  { accessType: 'read', recordType: 'SleepSession' } as const,
  { accessType: 'read', recordType: 'Steps' } as const,
  { accessType: 'read', recordType: 'Distance' } as const,
]

export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus()
  return status === SdkAvailabilityStatus.SDK_AVAILABLE
}

/**
 * Request all permissions needed for Phase 4 read-only sync.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  const available = await isHealthConnectAvailable()
  if (!available) return false

  await initialize()
  const granted = await requestPermission(REQUIRED_PERMISSIONS)

  return REQUIRED_PERMISSIONS.every((required) =>
    granted.some(
      (g) => g.recordType === required.recordType && g.accessType === required.accessType,
    ),
  )
}

/**
 * Read one day of Health Connect metrics and map to GarminDailyPayload shape.
 */
export async function readDailyMetrics(date: string): Promise<GarminDailyPayload | null> {
  try {
    const available = await isHealthConnectAvailable()
    if (!available) return null

    await initialize()

    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay = new Date(`${date}T23:59:59`)

    const timeRange = {
      operator: 'between' as const,
      startTime: startOfDay.toISOString(),
      endTime: endOfDay.toISOString(),
    }

    const [heartRateResult, sleepResult, stepsResult, distanceResult] = await Promise.allSettled([
      readRecords('HeartRate', { timeRangeFilter: timeRange }),
      readRecords('SleepSession', { timeRangeFilter: timeRange }),
      readRecords('Steps', { timeRangeFilter: timeRange }),
      readRecords('Distance', { timeRangeFilter: timeRange }),
    ])

    let heartRateAvg: number | null = null
    let heartRateMin: number | null = null
    let heartRateMax: number | null = null

    if (heartRateResult.status === 'fulfilled' && heartRateResult.value.records.length > 0) {
      const allSamples = heartRateResult.value.records.flatMap((r) =>
        r.samples.map((s) => s.beatsPerMinute),
      )
      if (allSamples.length > 0) {
        heartRateAvg = Math.round(allSamples.reduce((sum, v) => sum + v, 0) / allSamples.length)
        heartRateMin = Math.min(...allSamples)
        heartRateMax = Math.max(...allSamples)
      }
    }

    let sleepDurationMinutes: number | null = null

    if (sleepResult.status === 'fulfilled' && sleepResult.value.records.length > 0) {
      const totalMs = sleepResult.value.records.reduce((sum, s) => {
        const start = new Date(s.startTime).getTime()
        const end = new Date(s.endTime).getTime()
        return sum + (end - start)
      }, 0)
      sleepDurationMinutes = Math.round(totalMs / 60000)
    }

    let stepsTotal: number | null = null

    if (stepsResult.status === 'fulfilled' && stepsResult.value.records.length > 0) {
      stepsTotal = stepsResult.value.records.reduce((sum, r) => sum + r.count, 0)
    }

    let distanceMeters: number | null = null

    if (distanceResult.status === 'fulfilled' && distanceResult.value.records.length > 0) {
      distanceMeters = Math.round(
        distanceResult.value.records.reduce((sum, r) => sum + r.distance.inMeters, 0),
      )
    }

    if (heartRateAvg === null && stepsTotal === null && sleepDurationMinutes === null) {
      return null
    }

    return {
      date,
      heartRateAvgBpm: heartRateAvg,
      heartRateRestingBpm: heartRateMin,
      heartRateMaxBpm: heartRateMax,
      stepsTotal,
      activeCalories: null,
      totalCalories: null,
      distanceMeters,
      sleepDurationMinutes,
      sleepScore: null,
      stressAvg: null,
      bodyBatteryEnd: null,
    }
  } catch {
    return null
  }
}

/**
 * Sync past N days. Dedup conflicts count as skipped, not errors.
 */
export async function syncHealthConnectToChorum(days = 7): Promise<{
  synced: number
  skipped: number
  errors: number
}> {
  let synced = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < days; i += 1) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]!

    const metrics = await readDailyMetrics(dateStr)
    if (!metrics) {
      skipped += 1
      continue
    }

    try {
      await healthApi.createSnapshot({
        type: 'garmin_daily',
        recordedAt: new Date(`${dateStr}T12:00:00`).toISOString(),
        source: 'health_connect',
        payload: metrics,
      })
      synced += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('409') || msg.includes('Duplicate')) {
        skipped += 1
      } else {
        errors += 1
      }
    }
  }

  return { synced, skipped, errors }
}
