import { describe, it, expect } from 'vitest'
import { transformGarminDaily, transformGarminHRV } from '@/lib/health/garmin-transformer'

describe('transformGarminDaily', () => {
  it('extracts all fields from a well-formed response', () => {
    const raw = {
      calendarDate:                        '2026-03-01',
      averageHeartRateInBeatsPerMinute:    68,
      restingHeartRateInBeatsPerMinute:    55,
      maxHeartRateInBeatsPerMinute:        142,
      totalSteps:                          8432,
      activeKilocalories:                  520,
      totalKilocalories:                   2100,
      totalDistanceInMeters:               6200,
      sleepingSeconds:                     25200,  // 420 min = 7h
      sleepScore:                          82,
      averageStressLevel:                  28,
      bodyBatteryMostRecentValue:          65,
    }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.date).toBe('2026-03-01')
    expect(result!.heartRateAvgBpm).toBe(68)
    expect(result!.heartRateRestingBpm).toBe(55)
    expect(result!.heartRateMaxBpm).toBe(142)
    expect(result!.stepsTotal).toBe(8432)
    expect(result!.sleepDurationMinutes).toBe(420)
    expect(result!.sleepScore).toBe(82)
    expect(result!.stressAvg).toBe(28)
    expect(result!.bodyBatteryEnd).toBe(65)
  })

  it('handles alternate field names (API v2 shape)', () => {
    const raw = {
      startTimeLocal:  '2026-03-01T00:00:00',
      averageHeartRate: 72,
      steps:            10000,
    }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBe(72)
    expect(result!.stepsTotal).toBe(10000)
  })

  it('unwraps dailySummary wrapper object', () => {
    const raw = {
      dailySummary: {
        calendarDate:                     '2026-03-01',
        averageHeartRateInBeatsPerMinute: 65,
      }
    }
    const result = transformGarminDaily(raw)
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBe(65)
  })

  it('converts sleepingSeconds to sleepDurationMinutes', () => {
    const result = transformGarminDaily({ calendarDate: '2026-03-01', sleepingSeconds: 28800 })
    expect(result!.sleepDurationMinutes).toBe(480)  // 8h
  })

  it('returns null when date is missing', () => {
    expect(transformGarminDaily({ averageHeartRateInBeatsPerMinute: 70 })).toBeNull()
  })

  it('returns null for non-object inputs', () => {
    expect(transformGarminDaily(null)).toBeNull()
    expect(transformGarminDaily(undefined)).toBeNull()
    expect(transformGarminDaily('string')).toBeNull()
    expect(transformGarminDaily(42)).toBeNull()
    expect(transformGarminDaily([])).toBeNull()
  })

  it('returns null for missing optional fields (not undefined — null)', () => {
    const result = transformGarminDaily({ calendarDate: '2026-03-01' })
    expect(result).not.toBeNull()
    expect(result!.heartRateAvgBpm).toBeNull()
    expect(result!.sleepScore).toBeNull()
    expect(result!.stepsTotal).toBeNull()
  })

  it('handles string numbers gracefully', () => {
    const result = transformGarminDaily({ calendarDate: '2026-03-01', totalSteps: '9500' })
    expect(result!.stepsTotal).toBe(9500)
  })
})

describe('transformGarminHRV', () => {
  it('extracts HRV fields from hrvSummary wrapper', () => {
    const raw = {
      hrvSummary: {
        calendarDate: '2026-03-01',
        weeklyAvg:    48,
        lastNight:    45,
        status:       'BALANCED',
      }
    }
    const result = transformGarminHRV(raw)
    expect(result).not.toBeNull()
    expect(result!.date).toBe('2026-03-01')
    expect(result!.hrvWeeklyAvg).toBe(48)
    expect(result!.hrvLastNight).toBe(45)
    expect(result!.hrvStatus).toBe('BALANCED')
  })

  it('extracts HRV from flat response (alternate shape)', () => {
    const raw = {
      calendarDate:    '2026-03-01',
      hrvWeeklyAverage: 52,
      hrvLastNight:    49,
    }
    const result = transformGarminHRV(raw)
    expect(result).not.toBeNull()
    expect(result!.hrvWeeklyAvg).toBe(52)
  })

  it('returns null when both weeklyAvg and lastNight are missing', () => {
    const result = transformGarminHRV({ calendarDate: '2026-03-01' })
    expect(result).toBeNull()
  })

  it('returns null when date is missing', () => {
    expect(transformGarminHRV({ weeklyAvg: 48, lastNight: 45 })).toBeNull()
  })

  it('returns null for non-object inputs', () => {
    expect(transformGarminHRV(null)).toBeNull()
    expect(transformGarminHRV(undefined)).toBeNull()
    expect(transformGarminHRV('string')).toBeNull()
  })

  it('accepts partial HRV data (only weeklyAvg)', () => {
    const result = transformGarminHRV({ calendarDate: '2026-03-01', weeklyAvg: 50 })
    expect(result).not.toBeNull()
    expect(result!.hrvWeeklyAvg).toBe(50)
    expect(result!.hrvLastNight).toBeNull()
  })
})
