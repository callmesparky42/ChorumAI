import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const authenticate = vi.fn()
  const logPhiAccess = vi.fn(() => Promise.resolve())
  const hashPHI = vi.fn(() => 'hash-1')
  const encryptPHI = vi.fn(() => ({ ciphertext: 'encrypted', iv: 'iv-1' }))
  const decryptPHI = vi.fn(() => ({ ok: true }))

  const select = vi.fn()
  const insert = vi.fn()

  const eq = vi.fn(() => ({}))
  const and = vi.fn(() => ({}))
  const gte = vi.fn(() => ({}))
  const lte = vi.fn(() => ({}))
  const desc = vi.fn(() => ({}))

  return {
    authenticate,
    logPhiAccess,
    hashPHI,
    encryptPHI,
    decryptPHI,
    select,
    insert,
    eq,
    and,
    gte,
    lte,
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
    lte: mocks.lte,
    desc: mocks.desc,
  }
})

vi.mock('@/lib/customization/auth', () => ({
  authenticate: mocks.authenticate,
}))

vi.mock('@/lib/health/audit', () => ({
  logPhiAccess: mocks.logPhiAccess,
}))

vi.mock('@/lib/health/crypto', () => ({
  hashPHI: mocks.hashPHI,
  encryptPHI: mocks.encryptPHI,
  decryptPHI: mocks.decryptPHI,
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

import { GET, POST } from '@/app/api/health/snapshots/route'

function jsonRequest(url: string, method: 'POST' | 'GET', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockPostDbFlow({
  existingId,
  insertedId = 'snapshot-new',
}: {
  existingId?: string
  insertedId?: string
}) {
  const selectLimit = vi.fn().mockResolvedValue(existingId ? [{ id: existingId }] : [])
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  mocks.select.mockReturnValue({ from: selectFrom })

  const returning = vi.fn().mockResolvedValue([{ id: insertedId }])
  const values = vi.fn(() => ({ returning }))
  mocks.insert.mockReturnValue({ values })

  return { values }
}

function mockGetDbFlow(rows: Array<Record<string, unknown>>) {
  const offset = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn(() => ({ offset }))
  const orderBy = vi.fn(() => ({ limit }))
  const where = vi.fn(() => ({ orderBy }))
  const from = vi.fn(() => ({ where }))
  mocks.select.mockReturnValue({ from })

  return { limit, offset }
}

describe('POST /api/health/snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticate.mockResolvedValue({ userId: 'user-1', scopes: ['read:nebula'] })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.authenticate.mockResolvedValue(null)
    const res = await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {}) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when request body is invalid', async () => {
    const res = await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {
      type: 'garmin_daily',
    }) as never)
    expect(res.status).toBe(400)
  })

  it('creates a snapshot and returns { created: true }', async () => {
    mockPostDbFlow({})

    const res = await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload: { stepsTotal: 1000 },
    }) as never)

    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body).toEqual({ id: 'snapshot-new', created: true })
  })

  it('returns { created: false } on duplicate payload_hash without creating a second row', async () => {
    mockPostDbFlow({ existingId: 'snapshot-existing' })

    const res = await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload: { stepsTotal: 1000 },
    }) as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ id: 'snapshot-existing', created: false })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('writes a phi_audit_log entry on creation', async () => {
    mockPostDbFlow({})

    await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload: { stepsTotal: 1000 },
    }) as never)

    expect(mocks.logPhiAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: 'create',
      resourceType: 'snapshot',
    }))
  })

  it('does not store plaintext payload in health_snapshots', async () => {
    const { values } = mockPostDbFlow({})

    const payload = { stepsTotal: 1000, nested: { x: 1 } }
    await POST(jsonRequest('http://localhost/api/health/snapshots', 'POST', {
      type: 'garmin_daily',
      recordedAt: '2026-03-01T00:00:00.000Z',
      source: 'garmin',
      payload,
    }) as never)

    const inserted = values.mock.calls[0][0] as Record<string, unknown>
    expect(inserted['encryptedPayload']).toBe('encrypted')
    expect(inserted['encryptedPayload']).not.toBe(JSON.stringify(payload))
  })
})

describe('GET /api/health/snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticate.mockResolvedValue({ userId: 'user-1', scopes: ['read:nebula'] })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.authenticate.mockResolvedValue(null)
    const res = await GET(jsonRequest('http://localhost/api/health/snapshots', 'GET') as never)
    expect(res.status).toBe(401)
  })

  it('returns decrypted snapshots for authenticated user', async () => {
    mockGetDbFlow([
      {
        id: 's-1',
        userId: 'user-1',
        type: 'garmin_daily',
        recordedAt: new Date('2026-03-01T00:00:00.000Z'),
        source: 'garmin',
        encryptedPayload: 'cipher',
        payloadIv: 'iv',
        payloadHash: 'hash',
        storagePath: null,
        createdAt: new Date('2026-03-01T01:00:00.000Z'),
      },
    ])
    mocks.decryptPHI.mockReturnValue({ stepsTotal: 2000 })

    const res = await GET(jsonRequest('http://localhost/api/health/snapshots', 'GET') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.snapshots).toHaveLength(1)
    expect(body.snapshots[0].payload).toEqual({ stepsTotal: 2000 })
  })

  it('filters by type when type param is provided', async () => {
    mockGetDbFlow([])
    await GET(jsonRequest('http://localhost/api/health/snapshots?type=labs', 'GET') as never)
    expect(mocks.eq).toHaveBeenCalledWith('type', 'labs')
  })

  it('filters by date range when fromDate and toDate are provided', async () => {
    mockGetDbFlow([])
    await GET(jsonRequest('http://localhost/api/health/snapshots?fromDate=2026-03-01&toDate=2026-03-02', 'GET') as never)
    expect(mocks.gte).toHaveBeenCalled()
    expect(mocks.lte).toHaveBeenCalled()
  })

  it('respects limit and offset params', async () => {
    const chain = mockGetDbFlow([])
    await GET(jsonRequest('http://localhost/api/health/snapshots?limit=25&offset=50', 'GET') as never)
    expect(chain.limit).toHaveBeenCalledWith(25)
    expect(chain.offset).toHaveBeenCalledWith(50)
  })

  it('writes a phi_audit_log entry on view', async () => {
    mockGetDbFlow([])
    await GET(jsonRequest('http://localhost/api/health/snapshots', 'GET') as never)
    expect(mocks.logPhiAccess).toHaveBeenCalledWith(expect.objectContaining({
      action: 'view',
      resourceType: 'snapshot',
    }))
  })

  it('skips and counts rows where decryption fails rather than throwing', async () => {
    mockGetDbFlow([
      {
        id: 'ok',
        userId: 'user-1',
        type: 'garmin_daily',
        recordedAt: new Date('2026-03-01T00:00:00.000Z'),
        source: 'garmin',
        encryptedPayload: 'cipher-ok',
        payloadIv: 'iv-ok',
        payloadHash: 'hash-ok',
        storagePath: null,
        createdAt: new Date('2026-03-01T01:00:00.000Z'),
      },
      {
        id: 'bad',
        userId: 'user-1',
        type: 'garmin_daily',
        recordedAt: new Date('2026-03-02T00:00:00.000Z'),
        source: 'garmin',
        encryptedPayload: 'cipher-bad',
        payloadIv: 'iv-bad',
        payloadHash: 'hash-bad',
        storagePath: null,
        createdAt: new Date('2026-03-02T01:00:00.000Z'),
      },
    ])
    mocks.decryptPHI
      .mockReturnValueOnce({ stepsTotal: 1000 })
      .mockImplementationOnce(() => {
        throw new Error('bad decrypt')
      })

    const res = await GET(jsonRequest('http://localhost/api/health/snapshots', 'GET') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.snapshots).toHaveLength(1)
    expect(body.failedCount).toBe(1)
  })

  it('does not return snapshots belonging to a different user', async () => {
    mockGetDbFlow([])
    await GET(jsonRequest('http://localhost/api/health/snapshots', 'GET') as never)
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
