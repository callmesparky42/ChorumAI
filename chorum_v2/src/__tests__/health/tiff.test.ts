import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const download = vi.fn()
  const upload = vi.fn()
  const remove = vi.fn()
  const from = vi.fn(() => ({ download, upload, remove }))
  const createClient = vi.fn(() => ({ storage: { from } }))

  const sharpImpl = vi.fn()

  return {
    download,
    upload,
    remove,
    from,
    createClient,
    sharpImpl,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('sharp', () => ({
  default: mocks.sharpImpl,
}))

import { ConversionError, convertTiffToPng } from '@/lib/health/tiff'

function makeTiffBlob(): Blob {
  return new Blob([Buffer.from('fake-tiff')], { type: 'image/tiff' })
}

describe('convertTiffToPng', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.HEALTH_SUPABASE_URL = 'https://health.example.supabase.co'
    process.env.HEALTH_SUPABASE_SERVICE_KEY = 'service-key'

    mocks.download.mockResolvedValue({ data: makeTiffBlob(), error: null })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
  })

  it('converts a 3-page TIFF to 3 PNG files with correct storage paths', async () => {
    mocks.sharpImpl.mockImplementation((_input: unknown, options?: { animated?: boolean; page?: number }) => {
      if (options?.animated) {
        return { metadata: vi.fn().mockResolvedValue({ pages: 3 }) }
      }
      return {
        png: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockResolvedValue(Buffer.from(`page-${options?.page ?? 0}`)),
        }),
      }
    })

    const result = await convertTiffToPng('health-uploads/user-1/report.tiff', 'user-1')

    expect(result).toEqual([
      'health-uploads/user-1/report_page_1.png',
      'health-uploads/user-1/report_page_2.png',
      'health-uploads/user-1/report_page_3.png',
    ])
    expect(mocks.upload).toHaveBeenCalledTimes(3)
  })

  it('throws ConversionError when TIFF exceeds 50 pages', async () => {
    mocks.sharpImpl.mockImplementation((_input: unknown, options?: { animated?: boolean }) => {
      if (options?.animated) {
        return { metadata: vi.fn().mockResolvedValue({ pages: 51 }) }
      }
      return {
        png: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockResolvedValue(Buffer.from('irrelevant')),
        }),
      }
    })

    await expect(convertTiffToPng('health-uploads/user-1/big.tiff', 'user-1'))
      .rejects
      .toThrow(ConversionError)
  })

  it('skips a corrupt page and continues converting remaining pages', async () => {
    mocks.sharpImpl.mockImplementation((_input: unknown, options?: { animated?: boolean; page?: number }) => {
      if (options?.animated) {
        return { metadata: vi.fn().mockResolvedValue({ pages: 3 }) }
      }
      if (options?.page === 1) {
        throw new Error('corrupt page')
      }
      return {
        png: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockResolvedValue(Buffer.from(`page-${options?.page ?? 0}`)),
        }),
      }
    })

    const result = await convertTiffToPng('health-uploads/user-1/corrupt.tiff', 'user-1')

    expect(result).toEqual([
      'health-uploads/user-1/corrupt_page_1.png',
      'health-uploads/user-1/corrupt_page_3.png',
    ])
    expect(mocks.upload).toHaveBeenCalledTimes(2)
  })

  it('deletes the original TIFF from storage after successful conversion', async () => {
    mocks.sharpImpl.mockImplementation((_input: unknown, options?: { animated?: boolean }) => {
      if (options?.animated) {
        return { metadata: vi.fn().mockResolvedValue({ pages: 1 }) }
      }
      return {
        png: vi.fn().mockReturnValue({
          toBuffer: vi.fn().mockResolvedValue(Buffer.from('page-1')),
        }),
      }
    })

    await convertTiffToPng('health-uploads/user-1/single.tiff', 'user-1')

    expect(mocks.remove).toHaveBeenCalledWith(['health-uploads/user-1/single.tiff'])
  })

  it('returns empty array when storage download fails', async () => {
    mocks.download.mockResolvedValue({ data: null, error: new Error('download failed') })
    mocks.sharpImpl.mockImplementation(() => {
      throw new Error('sharp should not be called')
    })

    const result = await convertTiffToPng('health-uploads/user-1/missing.tiff', 'user-1')
    expect(result).toEqual([])
  })
})
