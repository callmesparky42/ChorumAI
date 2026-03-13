import { describe, it, expect } from 'vitest'
import { deidentify, deidentifyObject } from '@/lib/health/deidentify'

// ---------------------------------------------------------------------------
// PHI strings — must produce output containing at least one [TOKEN]
// ---------------------------------------------------------------------------

const PHI_CASES: string[] = [
  'Patient: John Smith',
  'DOB: 03/15/1982',
  'DOB: March 15, 1982',
  'DOB: 15 March 1982',
  'SSN: 123-45-6789',
  'Phone: (555) 867-5309',
  'Phone: 555-867-5309',
  'Phone: +1 (800) 555-0100',
  'Email: jsmith@example.com',
  'MRN: MRN: 00123456',
  'ZIP code: 94103',
  'ZIP: 94103-1234',
  'Member ID: 987654321012',
  'Account No. 4412882331',
  'IP address: 192.168.1.100',
  'URL: https://mychart.health.org/results/123',
  'Patient name: Jane Doe',
  'Date of service: 01/05/2026',
  'Admitted: 15 January 2026',
  'Device ID: 1234567890123',
]

// ---------------------------------------------------------------------------
// Clinical strings — must pass through EXACTLY unchanged
// ---------------------------------------------------------------------------

const CLINICAL_CASES: string[] = [
  'HR: 72 bpm',
  'HRV: 45 ms',
  'Resting HR: 58 bpm',
  'K+: 4.1 mEq/L',
  'Na+: 138 mEq/L',
  'Hemoglobin A1c: 5.4%',
  'LDL: 112 mg/dL',
  'HDL: 58 mg/dL',
  'Glucose: 94 mg/dL',
  'Creatinine: 0.9 mg/dL',
  'eGFR: 85 mL/min',
  'TSH: 2.1 mIU/L',
  'Steps: 8432',
  'Sleep: 7h 20min',
  'SpO2: 98%',
  'Weight: 78 kg',
  'BMI: 24.3',
  'Systolic BP: 118 mmHg',
  'Diastolic BP: 76 mmHg',
  'Temperature: 98.6 F',
]

describe('deidentify — PHI stripping', () => {
  it.each(PHI_CASES)('scrubs PHI: "%s"', (input) => {
    const result = deidentify(input)
    // Must contain at least one [TOKEN] — original sensitive data removed
    expect(result).toMatch(/\[.+?\]/)
  })
})

describe('deidentify — clinical values preserved', () => {
  it.each(CLINICAL_CASES)('preserves unchanged: "%s"', (clinical) => {
    expect(deidentify(clinical)).toBe(clinical)
  })
})

describe('deidentify — specific replacements', () => {
  it('strips SSN pattern', () => {
    expect(deidentify('SSN: 123-45-6789')).toContain('[SSN]')
    expect(deidentify('SSN: 123-45-6789')).not.toContain('123-45-6789')
  })

  it('strips email addresses', () => {
    expect(deidentify('Contact: user@example.com')).toContain('[EMAIL]')
    expect(deidentify('Contact: user@example.com')).not.toContain('user@example.com')
  })

  it('strips ZIP codes', () => {
    expect(deidentify('Location: 94103')).toContain('[ZIP]')
  })

  it('strips URLs', () => {
    const result = deidentify('Visit https://mychart.org/patient/12345 for results')
    expect(result).toContain('[URL]')
    expect(result).not.toContain('https://')
  })

  it('strips IP addresses', () => {
    expect(deidentify('From IP: 10.0.0.1')).toContain('[IP]')
  })

  it('does NOT alter numbers without context', () => {
    // Bare numbers without PHI context pass through
    expect(deidentify('72')).toBe('72')
    expect(deidentify('4.1')).toBe('4.1')
  })
})

describe('deidentifyObject', () => {
  it('scrubs string values recursively', () => {
    const input = {
      patient:     'John Smith',
      contactDate: '03/15/2026',
      metrics: {
        hr:   72,                                      // number — must pass through
        hrv:  45,                                      // number — must pass through
        note: 'Reviewed by Dr. James Brown on 01/05/2026',
      },
      values: ['HR: 72 bpm', 'Contact: john@example.com'],
    }
    const result = deidentifyObject(input) as typeof input

    // Names and dates stripped
    expect(result.patient).toContain('[NAME]')
    expect(result.contactDate).toContain('[DATE]')
    expect(result.metrics.note).toContain('[DATE]')

    // Numbers untouched
    expect(result.metrics.hr).toBe(72)
    expect(result.metrics.hrv).toBe(45)

    // Clinical string preserved
    expect(result.values[0]).toBe('HR: 72 bpm')

    // Email in array stripped
    expect(result.values[1]).toContain('[EMAIL]')
  })

  it('passes raw numbers through unchanged', () => {
    expect(deidentifyObject(72)).toBe(72)
    expect(deidentifyObject(4.1)).toBe(4.1)
    expect(deidentifyObject(0)).toBe(0)
  })

  it('passes booleans through unchanged', () => {
    expect(deidentifyObject(true)).toBe(true)
    expect(deidentifyObject(false)).toBe(false)
  })

  it('handles null and undefined', () => {
    expect(deidentifyObject(null)).toBeNull()
    expect(deidentifyObject(undefined)).toBeUndefined()
  })

  it('handles empty objects and arrays', () => {
    expect(deidentifyObject({})).toEqual({})
    expect(deidentifyObject([])).toEqual([])
  })

  it('handles nested arrays of objects', () => {
    const input = [
      { name: 'John Smith', hr: 72 },
      { name: 'Jane Doe',   hr: 68 },
    ]
    const result = deidentifyObject(input) as typeof input
    expect(result[0]!.name).toContain('[NAME]')
    expect(result[0]!.hr).toBe(72)   // number untouched
    expect(result[1]!.name).toContain('[NAME]')
  })

  it('does not alter clinical lab values in a realistic snapshot', () => {
    const snapshot = {
      type:   'garmin_daily',
      source: 'garmin',
      data: {
        date:               '2026-03-01',
        heartRateAvgBpm:    72,
        heartRateRestingBpm: 55,
        stepsTotal:         8432,
        sleepScore:         82,
        hrvRmssdMs:         45,
      }
    }
    const result = deidentifyObject(snapshot) as typeof snapshot
    // All numeric fields must be unchanged
    expect(result.data.heartRateAvgBpm).toBe(72)
    expect(result.data.stepsTotal).toBe(8432)
    expect(result.data.hrvRmssdMs).toBe(45)
    // Date string: '2026-03-01' contains no MM/DD pattern — should pass through
    expect(result.data.date).toBe('2026-03-01')
  })
})
