// src/lib/health/trend-math.ts
// Pure statistical functions for health trend computation.
// Extracted from the trends route so they can be independently tested.

import type { TrendPoint, TrendAnomaly } from '@chorum/health-types'

/**
 * Compute a sliding window moving average.
 * Returns empty array when points.length < window.
 * Result length = points.length - window + 1.
 */
export function computeMovingAverage(points: TrendPoint[], window: number): TrendPoint[] {
  if (points.length < window) return []

  return points.slice(window - 1).map((_, idx) => {
    const slice = points.slice(idx, idx + window)
    const avg   = slice.reduce((sum, p) => sum + p.value, 0) / slice.length
    return {
      date:  points[idx + window - 1].date,
      value: Math.round(avg * 10) / 10,
    }
  })
}

/**
 * Compute population mean and standard deviation.
 * Returns null when fewer than 3 points (too few for meaningful stats).
 */
export function computeBaseline(
  points: TrendPoint[],
): { mean: number; stdDev: number } | null {
  if (points.length < 3) return null

  const values   = points.map(p => p.value)
  const mean     = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length

  return {
    mean:   Math.round(mean * 10) / 10,
    stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
  }
}

/**
 * Flag data points that deviate >= 2 standard deviations from the baseline mean.
 * Returns empty array when baseline cannot be computed or stdDev is 0.
 */
export function detectAnomalies(points: TrendPoint[]): TrendAnomaly[] {
  const baseline = computeBaseline(points)
  if (!baseline || baseline.stdDev === 0) return []

  return points
    .map(p => ({
      ...p,
      deviation: Math.abs(p.value - baseline.mean) / baseline.stdDev,
    }))
    .filter(p => p.deviation >= 2)
    .map(p => ({
      date:      p.date,
      value:     p.value,
      deviation: Math.round(p.deviation * 100) / 100,
    }))
}
