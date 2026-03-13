import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const select = vi.fn()
  const insert = vi.fn()
  const decryptPHI = vi.fn()
  const encryptPHI = vi.fn(() => ({ ciphertext: 'cipher', iv: 'iv', tag: 'tag' }))
  const hashPHI = vi.fn(() => 'hash-1')
  const logPhiAccess = vi.fn(() => Promise.resolve())
  const eq = vi.fn(() => ({}))
  const and = vi.fn(() => ({}))
  const gte = vi.fn(() => ({}))
  const desc = vi.fn(() => ({}))

  return {
    select,
    insert,
    decryptPHI,
    encryptPHI,
    hashPHI,
    logPhiAccess,
    eq,
    and,
    gte,
    desc,
  }
})

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: mocks.eq,
    and: mocks.and,
    gte: mocks.gte,
    desc: mocks.desc,
  }
})

vi.mock('@/db/health', () => ({
  healthDb: {
    select: mocks.select,
    insert: mocks.insert,
  },
}))

vi.mock('@/db/health-schema', () => ({
  healthSnapshots: {
    id: 'id',
    userId: 'user_id',
    type: 'type',
    recordedAt: 'recorded_at',
    source: 'source',
    payloadHash: 'payload_hash',
    encryptedPayload: 'encrypted_payload',
    payloadIv: 'payload_iv',
    storagePath: 'storage_path',
  },
  healthSources: {
    active: 'active',
    domain: 'domain',
    name: 'name',
    baseUrl: 'base_url',
  },
}))

vi.mock('@/lib/health/crypto', () => ({
  decryptPHI: mocks.decryptPHI,
  encryptPHI: mocks.encryptPHI,
  hashPHI: mocks.hashPHI,
}))

vi.mock('@/lib/health/audit', () => ({
  logPhiAccess: mocks.logPhiAccess,
}))

import {
  HealthMcpError,
  handleHealthCheckup,
  handleHealthSnapshot,
  handleHealthSources,
  handleHealthTrends,
} from '@/lib/customization/health-handlers'

const AUTH = {
  userId: '11111111-1111-4111-8111-111111111111',
  scopes: ['read:nebula', 'write:nebula', 'write:feedback'],
} as const

function selectRowsWithOrder(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn(() => ({ limit }))
  const where = vi.fn(() => ({ orderBy }))
  const from = vi.fn(() => ({ where }))
  mocks.select.mockReturnValueOnce({ from })
}

function selectRowsWithoutOrder(rows: Array<Record<string, unknown>>) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn(() => ({ where }))
  mocks.select.mockReturnValueOnce({ from })
}

function selectDedupRows(rows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  mocks.select.mockReturnValueOnce({ from })
}

function mockInsertReturning(id: string) {
  const returning = vi.fn().mockResolvedValue([{ id }])
  const values = vi.fn(() => ({ returning }))
  mocks.insert.mockReturnValueOnce({ values })
}

describe('handleHealthTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns count: 0 message when no data exists for type', async () => {
    selectRowsWithOrder([])

    const result = await handleHealthTrends({ type: 'garmin_daily', days: 7 }, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>

    expect(parsed.count).toBe(0)
    expect(parsed.message).toContain('No garmin_daily data')
  })

  it('returns correct avg restingHR across multiple garmin_daily snapshots', async () => {
    selectRowsWithOrder([
      { encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
      { encryptedPayload: 'b', payloadIv: 'i', recordedAt: new Date('2026-03-02') },
    ])
    mocks.decryptPHI
      .mockReturnValueOnce({ heartRateRestingBpm: 55, stepsTotal: 9000, sleepScore: 70 })
      .mockReturnValueOnce({ heartRateRestingBpm: 65, stepsTotal: 11000, sleepScore: 80 })

    const result = await handleHealthTrends({ type: 'garmin_daily', days: 7 }, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    const resting = parsed.restingHR as Record<string, unknown>

    expect(resting.avg).toBe(60)
  })

  it('rejects days param > 90', async () => {
    await expect(handleHealthTrends({ type: 'garmin_daily', days: 91 }, AUTH))
      .rejects
      .toMatchObject({ code: -32602 })
  })

  it('writes a view phi_audit_log entry', async () => {
    selectRowsWithOrder([
      { encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
    ])
    mocks.decryptPHI.mockReturnValue({ heartRateRestingBpm: 55, stepsTotal: 9000, sleepScore: 70 })

    await handleHealthTrends({ type: 'garmin_daily', days: 7 }, AUTH)
    expect(mocks.logPhiAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: 'view',
      resourceType: 'trend',
    }))
  })
})

describe('handleHealthSources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns up to 5 sources', async () => {
    selectRowsWithoutOrder([
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org', domain: 'general' },
      { name: 'Cleveland Clinic', url: 'https://my.clevelandclinic.org', domain: 'cardiology' },
      { name: 'NIH MedlinePlus', url: 'https://medlineplus.gov', domain: 'general' },
      { name: 'NHS', url: 'https://www.nhs.uk', domain: 'general' },
      { name: 'ACC/AHA Guidelines', url: 'https://www.acc.org', domain: 'cardiology' },
      { name: 'UpToDate', url: 'https://www.uptodate.com', domain: 'clinical' },
    ])

    const result = await handleHealthSources({ query: 'clinic' }, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>
    expect(parsed.length).toBeLessThanOrEqual(5)
  })

  it('filters by domain when domain param is provided', async () => {
    selectRowsWithoutOrder([
      { name: 'Cleveland Clinic', url: 'https://my.clevelandclinic.org', domain: 'cardiology' },
    ])

    await handleHealthSources({ query: 'clinic', domain: 'cardiology' }, AUTH)
    expect(mocks.eq).toHaveBeenCalledWith('domain', 'cardiology')
  })

  it('returns empty array when query matches nothing', async () => {
    selectRowsWithoutOrder([
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org', domain: 'general' },
    ])

    const result = await handleHealthSources({ query: 'neurosurgery' }, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Array<Record<string, unknown>>
    expect(parsed).toEqual([])
  })

  it('does not write a phi_audit_log entry (no PHI involved)', async () => {
    selectRowsWithoutOrder([])
    await handleHealthSources({ query: 'cardiology' }, AUTH)
    expect(mocks.logPhiAccess).not.toHaveBeenCalled()
  })
})

describe('handleHealthCheckup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns no data when rows cannot be decrypted', async () => {
    selectRowsWithOrder([
      { type: 'mychart', encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
      { type: 'ocr_document', encryptedPayload: 'b', payloadIv: 'i', recordedAt: new Date('2026-03-02') },
    ])
    mocks.decryptPHI.mockImplementation(() => { throw new Error('bad decrypt') })

    const result = await handleHealthCheckup({}, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(parsed.result).toContain('No health data found')
    expect(parsed.snapshotsAnalyzed).toBe(0)
  })

  it('returns periodDays defaulted to 7', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
    ])
    mocks.decryptPHI.mockReturnValue({ heartRateRestingBpm: 60, stepsTotal: 8000 })

    const result = await handleHealthCheckup({}, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(parsed.periodDays).toBe(7)
  })

  it('returns message when no data exists', async () => {
    selectRowsWithOrder([])
    const result = await handleHealthCheckup({}, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(parsed.result).toContain('No health data found')
  })

  it('returns deidentifiedData payload and instruction for MCP enrichment', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
    ])
    mocks.decryptPHI.mockReturnValue({ heartRateRestingBpm: 60, stepsTotal: 8000 })

    const result = await handleHealthCheckup({}, AUTH)
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>
    expect(parsed.snapshotsAnalyzed).toBe(1)
    expect(Array.isArray(parsed.deidentifiedData)).toBe(true)
    expect(typeof parsed.instruction).toBe('string')
  })

  it('writes a view phi_audit_log entry with resourceType snapshot', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', encryptedPayload: 'a', payloadIv: 'i', recordedAt: new Date('2026-03-01') },
    ])
    mocks.decryptPHI.mockReturnValue({ heartRateRestingBpm: 60, stepsTotal: 8000 })

    await handleHealthCheckup({}, AUTH)
    expect(mocks.logPhiAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: 'view',
      resourceType: 'snapshot',
    }))
  })
})

describe('handleHealthSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400-equivalent error for invalid params', async () => {
    await expect(handleHealthSnapshot({ type: 'garmin_daily' }, AUTH))
      .rejects
      .toBeInstanceOf(HealthMcpError)
  })

  it('stores snapshot and returns { created: true } for valid garmin_daily payload', async () => {
    selectDedupRows([])
    mockInsertReturning('snap-1')

    const result = await handleHealthSnapshot({
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload: { stepsTotal: 9999 },
    }, AUTH)

    expect(result.content[0]!.text).toContain('Duplicate: false')
  })

  it('returns { created: false } on duplicate', async () => {
    selectDedupRows([{ id: 'snap-existing' }])

    const result = await handleHealthSnapshot({
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload: { stepsTotal: 9999 },
    }, AUTH)

    expect(result.content[0]!.text).toContain('Duplicate: true')
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
