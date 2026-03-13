import { describe, expect, it, vi } from 'vitest'

const KEY_A = Buffer.alloc(32, 1).toString('base64')
const KEY_B = Buffer.alloc(32, 2).toString('base64')

async function loadCryptoModule(healthKey: string | undefined, coreKey: string | undefined) {
  vi.resetModules()

  if (healthKey === undefined) {
    delete process.env.HEALTH_ENCRYPTION_KEY
  } else {
    process.env.HEALTH_ENCRYPTION_KEY = healthKey
  }

  if (coreKey === undefined) {
    delete process.env.ENCRYPTION_KEY
  } else {
    process.env.ENCRYPTION_KEY = coreKey
  }

  return import('@/lib/health/crypto')
}

describe('PHI Encryption', () => {
  it('encryptPHI + decryptPHI roundtrip preserves data for all snapshot types', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    const payloads = [
      { date: '2026-03-01', heartRateAvgBpm: 65, stepsTotal: 4567 },
      { date: '2026-03-01', hrvRmssdMs: 42, hrvStatus: 'balanced' },
      {
        reportDate: '2026-02-28',
        labName: 'Quest',
        orderingPhysician: null,
        results: [{ name: 'Potassium', value: 4.2, unit: 'mEq/L', refRangeLow: 3.5, refRangeHigh: 5.1, flag: null }],
      },
      {
        reportDate: '2026-02-20',
        deviceModel: 'Cobalt XT',
        batteryPct: 71,
        ertIndicator: false,
        nsVtEpisodes: 1,
        svtEpisodes: 0,
        reviewerNotes: 'Stable',
        storagePages: ['health-uploads/u/page_1.png'],
      },
      {
        recordedAt: '2026-03-01T10:00:00.000Z',
        systolicBP: 120,
        diastolicBP: 80,
        heartRate: 68,
        o2Sat: 98,
        temperatureF: 98.6,
        weightLbs: 175,
        bloodGlucose: 92,
      },
      {
        source: 'MyChart',
        rawText: 'de-identified text',
        parsedFields: { test: 'value' },
      },
    ] as const

    for (const payload of payloads) {
      const encrypted = crypto.encryptPHI(payload)
      const decrypted = crypto.decryptPHI(encrypted.ciphertext, encrypted.iv)
      expect(decrypted).toEqual(payload)
    }
  })

  it('encryptPHI produces unique IVs across 100 calls with identical input', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    const ivs = new Set<string>()
    const payload = { date: '2026-03-01', stepsTotal: 1234 }

    for (let i = 0; i < 100; i += 1) {
      ivs.add(crypto.encryptPHI(payload).iv)
    }

    expect(ivs.size).toBe(100)
  })

  it('decryptPHI throws HealthDecryptionError when IV is tampered', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    const encrypted = crypto.encryptPHI({ hello: 'world' })
    const ivBytes = Buffer.from(encrypted.iv, 'base64')
    ivBytes[0] = (ivBytes[0] ?? 0) ^ 0xff

    expect(() => crypto.decryptPHI(encrypted.ciphertext, ivBytes.toString('base64')))
      .toThrow(crypto.HealthDecryptionError)
  })

  it('decryptPHI throws HealthDecryptionError when ciphertext is tampered', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    const encrypted = crypto.encryptPHI({ hello: 'world' })
    const bytes = Buffer.from(encrypted.ciphertext, 'base64')
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff

    expect(() => crypto.decryptPHI(bytes.toString('base64'), encrypted.iv))
      .toThrow(crypto.HealthDecryptionError)
  })

  it('decryptPHI throws HealthDecryptionError when wrong key is used', async () => {
    const cryptoA = await loadCryptoModule(KEY_A, KEY_B)
    const encrypted = cryptoA.encryptPHI({ top: 'secret' })

    const cryptoB = await loadCryptoModule(KEY_B, KEY_A)
    expect(() => cryptoB.decryptPHI(encrypted.ciphertext, encrypted.iv))
      .toThrow(cryptoB.HealthDecryptionError)
  })

  it('hashPHI returns identical output for equivalent objects regardless of key order', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    const a = { z: 3, a: 1, nested: { c: 3, b: 2 } }
    const b = { a: 1, nested: { b: 2, c: 3 }, z: 3 }
    expect(crypto.hashPHI(a)).toBe(crypto.hashPHI(b))
  })

  it('hashPHI returns different output for different objects', async () => {
    const crypto = await loadCryptoModule(KEY_A, KEY_B)
    expect(crypto.hashPHI({ value: 1 })).not.toBe(crypto.hashPHI({ value: 2 }))
  })

  it('module throws on load when HEALTH_ENCRYPTION_KEY is absent', async () => {
    await expect(loadCryptoModule(undefined, KEY_B)).rejects.toThrow('HEALTH_ENCRYPTION_KEY is not set.')
  })

  it('module throws on load when HEALTH_ENCRYPTION_KEY equals ENCRYPTION_KEY', async () => {
    await expect(loadCryptoModule(KEY_A, KEY_A)).rejects.toThrow(
      'HEALTH_ENCRYPTION_KEY must not equal ENCRYPTION_KEY.',
    )
  })
})
