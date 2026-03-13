import { describe, it, expect } from 'vitest'
import { computeMovingAverage, computeBaseline, detectAnomalies } from '@/lib/health/trend-math'
import type { TrendPoint } from '@chorum/health-types'

function makePoints(values: number[]): TrendPoint[] {
  return values.map((value, i) => ({
    date:  `2026-01-${String(i + 1).padStart(2, '0')}`,
    value,
  }))
}

// ---------------------------------------------------------------------------
// computeMovingAverage
// ---------------------------------------------------------------------------

describe('computeMovingAverage', () => {
  it('returns empty array when fewer points than window', () => {
    expect(computeMovingAverage(makePoints([60, 62, 65]), 7)).toEqual([])
    expect(computeMovingAverage(makePoints([]), 7)).toEqual([])
    expect(computeMovingAverage(makePoints([70]), 2)).toEqual([])
  })

  it('returns single element when points.length === window', () => {
    const points = makePoints([70, 72, 68, 74, 70, 72, 68])  // 7 points
    const ma     = computeMovingAverage(points, 7)
    expect(ma).toHaveLength(1)
    const expected = (70 + 72 + 68 + 74 + 70 + 72 + 68) / 7
    expect(ma[0]!.value).toBeCloseTo(expected, 0)
  })

  it('result length equals points.length - window + 1', () => {
    const points = makePoints(Array.from({ length: 30 }, (_, i) => 65 + i % 10))
    expect(computeMovingAverage(points, 7)).toHaveLength(24)
    expect(computeMovingAverage(points, 30)).toHaveLength(1)
    expect(computeMovingAverage(points, 1)).toHaveLength(30)
  })

  it('window of 1 returns same points', () => {
    const points = makePoints([70, 72, 68])
    const ma     = computeMovingAverage(points, 1)
    expect(ma).toHaveLength(3)
    expect(ma[0]!.value).toBe(70)
    expect(ma[1]!.value).toBe(72)
    expect(ma[2]!.value).toBe(68)
  })

  it('dates are taken from the last point in each window', () => {
    const points = makePoints([70, 72, 68, 74, 70, 72, 68, 70])
    const ma     = computeMovingAverage(points, 7)
    // Window [0..6] → date of index 6
    expect(ma[0]!.date).toBe(points[6]!.date)
    // Window [1..7] → date of index 7
    expect(ma[1]!.date).toBe(points[7]!.date)
  })

  it('rounds to one decimal place', () => {
    // Mean of [1, 2, 3] = 2.0 — exact
    expect(computeMovingAverage(makePoints([1, 2, 3]), 3)[0]!.value).toBe(2)
    // Mean of [1, 1, 2] = 1.3333... → rounds to 1.3
    expect(computeMovingAverage(makePoints([1, 1, 2]), 3)[0]!.value).toBe(1.3)
  })
})

// ---------------------------------------------------------------------------
// computeBaseline
// ---------------------------------------------------------------------------

describe('computeBaseline', () => {
  it('returns null for fewer than 3 points', () => {
    expect(computeBaseline(makePoints([]))).toBeNull()
    expect(computeBaseline(makePoints([70]))).toBeNull()
    expect(computeBaseline(makePoints([70, 72]))).toBeNull()
  })

  it('computes mean correctly', () => {
    const baseline = computeBaseline(makePoints([60, 70, 80]))
    expect(baseline).not.toBeNull()
    expect(baseline!.mean).toBeCloseTo(70, 0)
  })

  it('returns stdDev of 0 for uniform data', () => {
    const baseline = computeBaseline(makePoints([70, 70, 70, 70, 70]))
    expect(baseline!.stdDev).toBe(0)
    expect(baseline!.mean).toBe(70)
  })

  it('computes population stdDev (not sample)', () => {
    // Population stdDev of [2, 4, 4, 4, 5, 5, 7, 9] = 2.0
    const baseline = computeBaseline(makePoints([2, 4, 4, 4, 5, 5, 7, 9]))
    expect(baseline!.mean).toBeCloseTo(5, 0)
    expect(baseline!.stdDev).toBeCloseTo(2, 0)
  })
})

// ---------------------------------------------------------------------------
// detectAnomalies
// ---------------------------------------------------------------------------

describe('detectAnomalies', () => {
  it('returns empty array for uniform data (stdDev = 0)', () => {
    const points = makePoints(Array(20).fill(70))
    expect(detectAnomalies(points)).toEqual([])
  })

  it('returns empty array for fewer than 3 points', () => {
    expect(detectAnomalies(makePoints([60, 200]))).toEqual([])
  })

  it('flags values >= 2 SD from the mean', () => {
    // 29 values of 70, then one spike at 200 → extreme anomaly
    const points   = makePoints([...Array(29).fill(70), 200])
    const anomalies = detectAnomalies(points)
    expect(anomalies.length).toBeGreaterThan(0)
    const spike = anomalies.find(a => a.value === 200)
    expect(spike).toBeDefined()
    expect(spike!.deviation).toBeGreaterThanOrEqual(2)
  })

  it('does not flag values within 2 SD', () => {
    // Typical resting HR variation: 58-72 around mean of 65
    const values   = [65, 63, 67, 64, 66, 65, 68, 62, 67, 65]
    const anomalies = detectAnomalies(makePoints(values))
    // All within normal variation — no anomalies
    expect(anomalies.length).toBe(0)
  })

  it('deviation is rounded to 2 decimal places', () => {
    const points   = makePoints([...Array(29).fill(70), 200])
    const anomalies = detectAnomalies(points)
    for (const a of anomalies) {
      const decimals = (a.deviation.toString().split('.')[1] ?? '').length
      expect(decimals).toBeLessThanOrEqual(2)
    }
  })
})
