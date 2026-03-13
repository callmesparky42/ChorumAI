import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getServerSession = vi.fn()
  const select = vi.fn()
  const insert = vi.fn()
  const decryptPHI = vi.fn()
  const encryptPHI = vi.fn(() => ({ ciphertext: 'cipher', iv: 'iv', tag: 'tag' }))
  const hashPHI = vi.fn(() => 'hash-1')
  const logPhiAccess = vi.fn(() => Promise.resolve())
  const convertTiffToPng = vi.fn()
  const createSignedUrl = vi.fn()
  const createSignedUploadUrl = vi.fn()
  const createClient = vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl,
        createSignedUploadUrl,
      })),
    },
  }))
  const eq = vi.fn(() => ({}))
  const and = vi.fn(() => ({}))
  const gte = vi.fn(() => ({}))
  const desc = vi.fn(() => ({}))
  const sql = vi.fn((strings: TemplateStringsArray) => strings.join(''))

  return {
    getServerSession,
    select,
    insert,
    decryptPHI,
    encryptPHI,
    hashPHI,
    logPhiAccess,
    convertTiffToPng,
    createSignedUrl,
    createSignedUploadUrl,
    createClient,
    eq,
    and,
    gte,
    desc,
    sql,
  }
})

vi.mock('next-auth/next', () => ({
  getServerSession: mocks.getServerSession,
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    eq: mocks.eq,
    and: mocks.and,
    gte: mocks.gte,
    desc: mocks.desc,
    sql: mocks.sql,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

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
    encryptedPayload: 'encrypted_payload',
    payloadIv: 'payload_iv',
    payloadHash: 'payload_hash',
    storagePath: 'storage_path',
    createdAt: 'created_at',
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

vi.mock('@/lib/health/tiff', () => ({
  ConversionError: class ConversionError extends Error {},
  convertTiffToPng: mocks.convertTiffToPng,
}))

import {
  confirmHealthUpload,
  getHealthDashboardData,
  getSignedReadUrls,
  presignHealthUpload,
} from '@/lib/shell/health-actions'

function selectRowsWithOrder(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn(() => ({ limit }))
  const where = vi.fn(() => ({ orderBy }))
  const from = vi.fn(() => ({ where }))
  mocks.select.mockReturnValueOnce({ from })
}

function selectRowsCount(count: number) {
  const where = vi.fn().mockResolvedValue([{ count }])
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

describe('getHealthDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_SUPABASE_URL = 'https://health.example.supabase.co'
    process.env.HEALTH_SUPABASE_SERVICE_KEY = 'service-key'
    mocks.getServerSession.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
  })

  it('returns empty vitals and empty arrays when no snapshots exist', async () => {
    selectRowsWithOrder([])
    selectRowsWithOrder([])
    selectRowsCount(0)

    const data = await getHealthDashboardData()
    expect(data.vitals.restingHR).toBeNull()
    expect(data.hrChart).toEqual([])
    expect(data.recentSnapshots).toEqual([])
  })

  it('returns LatestVitals populated from garmin_daily snapshot', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', recordedAt: new Date('2026-03-02'), encryptedPayload: 'a', payloadIv: 'i' },
    ])
    selectRowsWithOrder([
      {
        id: 'snap-1',
        type: 'garmin_daily',
        source: 'garmin',
        recordedAt: new Date('2026-03-02'),
        encryptedPayload: 'a',
        payloadIv: 'i',
        storagePath: null,
      },
    ])
    selectRowsCount(1)
    mocks.decryptPHI.mockReturnValue({
      heartRateRestingBpm: 58,
      heartRateAvgBpm: 64,
      heartRateMaxBpm: 101,
      stepsTotal: 9847,
      sleepScore: 74,
      sleepDurationMinutes: 430,
    })

    const data = await getHealthDashboardData()
    expect(data.vitals.restingHR?.value).toBe(58)
    expect(data.vitals.steps?.value).toBe(9847)
    expect(data.vitals.sleepScore?.value).toBe(74)
  })

  it('returns HRChartPoint array sorted oldest-first', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', recordedAt: new Date('2026-03-02'), encryptedPayload: 'a', payloadIv: 'i' },
      { type: 'garmin_daily', recordedAt: new Date('2026-03-01'), encryptedPayload: 'b', payloadIv: 'i' },
    ])
    selectRowsWithOrder([])
    selectRowsCount(2)
    mocks.decryptPHI
      .mockReturnValueOnce({ date: '2026-03-02', heartRateAvgBpm: 70, heartRateRestingBpm: 60, heartRateMaxBpm: 110, stepsTotal: 9000, sleepDurationMinutes: 420 })
      .mockReturnValueOnce({ date: '2026-03-01', heartRateAvgBpm: 68, heartRateRestingBpm: 59, heartRateMaxBpm: 108, stepsTotal: 8000, sleepDurationMinutes: 410 })

    const data = await getHealthDashboardData()
    expect(data.hrChart[0]?.date).toBe('2026-03-01')
    expect(data.hrChart[1]?.date).toBe('2026-03-02')
  })

  it('sets restingHR from most recent garmin_daily snapshot', async () => {
    selectRowsWithOrder([
      { type: 'garmin_daily', recordedAt: new Date('2026-03-02'), encryptedPayload: 'a', payloadIv: 'i' },
      { type: 'garmin_daily', recordedAt: new Date('2026-03-01'), encryptedPayload: 'b', payloadIv: 'i' },
    ])
    selectRowsWithOrder([])
    selectRowsCount(2)
    mocks.decryptPHI
      .mockReturnValueOnce({ heartRateRestingBpm: 55, heartRateAvgBpm: 65, heartRateMaxBpm: 105, stepsTotal: 7000, sleepDurationMinutes: 400 })
      .mockReturnValueOnce({ heartRateRestingBpm: 62, heartRateAvgBpm: 70, heartRateMaxBpm: 110, stepsTotal: 9000, sleepDurationMinutes: 430 })

    const data = await getHealthDashboardData()
    expect(data.vitals.restingHR?.value).toBe(55)
  })

  it('writes a view phi_audit_log entry', async () => {
    selectRowsWithOrder([])
    selectRowsWithOrder([])
    selectRowsCount(0)

    await getHealthDashboardData()
    expect(mocks.logPhiAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: 'view',
      resourceType: 'report',
    }))
  })
})

describe('presignHealthUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_SUPABASE_URL = 'https://health.example.supabase.co'
    process.env.HEALTH_SUPABASE_SERVICE_KEY = 'service-key'
    mocks.getServerSession.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://upload.example/signed' },
      error: null,
    })
  })

  it('rejects files over 50 MB', async () => {
    await expect(presignHealthUpload('big.pdf', 'application/pdf', 60_000_000))
      .rejects
      .toThrow('file_too_large')
  })

  it('rejects unsupported MIME type', async () => {
    await expect(presignHealthUpload('script.exe', 'application/x-msdownload', 1000))
      .rejects
      .toThrow('unsupported_type')
  })

  it('returns uploadUrl and storageKey for valid input', async () => {
    const result = await presignHealthUpload('report.pdf', 'application/pdf', 10_000)
    expect(result.uploadUrl).toBe('https://upload.example/signed')
    expect(result.storageKey).toContain('health-uploads/11111111-1111-4111-8111-111111111111/')
  })
})

describe('confirmHealthUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_SUPABASE_URL = 'https://health.example.supabase.co'
    process.env.HEALTH_SUPABASE_SERVICE_KEY = 'service-key'
    mocks.getServerSession.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111' },
    })
  })

  it('rejects storageKey that does not start with health-uploads/{userId}/', async () => {
    await expect(confirmHealthUpload(
      'health-uploads/someone-else/file.pdf',
      'mychart',
      '2026-03-01T00:00:00.000Z',
      'file_upload',
    )).rejects.toThrow('forbidden_storage_key')
  })

  it('creates snapshot record for non-TIFF file', async () => {
    selectDedupRows([])
    mockInsertReturning('snap-2')

    const result = await confirmHealthUpload(
      'health-uploads/11111111-1111-4111-8111-111111111111/file.pdf',
      'mychart',
      '2026-03-01T00:00:00.000Z',
      'file_upload',
    )

    expect(result.snapshotId).toBe('snap-2')
    expect(mocks.convertTiffToPng).not.toHaveBeenCalled()
  })

  it('returns tiffPages array after TIFF conversion', async () => {
    mocks.convertTiffToPng.mockResolvedValue([
      'health-uploads/11111111-1111-4111-8111-111111111111/file_page_1.png',
    ])
    selectDedupRows([])
    mockInsertReturning('snap-3')

    const result = await confirmHealthUpload(
      'health-uploads/11111111-1111-4111-8111-111111111111/file.tiff',
      'icd_report',
      '2026-03-01T00:00:00.000Z',
      'file_upload',
    )

    expect(result.snapshotId).toBe('snap-3')
    expect(result.tiffPages).toHaveLength(1)
  })
})

describe('getSignedReadUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_SUPABASE_URL = 'https://health.example.supabase.co'
    process.env.HEALTH_SUPABASE_SERVICE_KEY = 'service-key'
  })

  it('returns empty object for empty input array', async () => {
    const result = await getSignedReadUrls([])
    expect(result).toEqual({})
  })

  it('throws when more than 20 keys are provided', async () => {
    const keys = Array.from({ length: 21 }, (_, i) => `health-uploads/user/doc_${i}.png`)
    await expect(getSignedReadUrls(keys)).rejects.toThrow('maximum of 20')
  })

  it('returns signed URL map for valid keys', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://read.example/file' },
      error: null,
    })
    const keys = ['health-uploads/user/file_1.png', 'health-uploads/user/file_2.png']
    const result = await getSignedReadUrls(keys)
    expect(result[keys[0]!]).toBe('https://read.example/file')
    expect(result[keys[1]!]).toBe('https://read.example/file')
  })
})
