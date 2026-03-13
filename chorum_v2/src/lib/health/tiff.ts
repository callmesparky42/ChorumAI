import path from 'node:path'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

export class ConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConversionError'
  }
}

function getStorageClient() {
  const healthSupabaseUrl = process.env.HEALTH_SUPABASE_URL
  const healthSupabaseServiceKey = process.env.HEALTH_SUPABASE_SERVICE_KEY
  if (!healthSupabaseUrl || !healthSupabaseServiceKey) {
    throw new ConversionError('Missing HEALTH_SUPABASE_URL or HEALTH_SUPABASE_SERVICE_KEY')
  }
  return createClient(healthSupabaseUrl, healthSupabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function convertTiffToPng(storageKey: string, userId: string): Promise<string[]> {
  const supabase = getStorageClient()
  const bucket = supabase.storage.from('health-uploads')

  const { data: downloaded, error: downloadError } = await bucket.download(storageKey)
  if (downloadError || !downloaded) {
    console.error('[health-tiff] Failed to download TIFF:', downloadError)
    return []
  }

  const sourceBuffer = Buffer.from(await downloaded.arrayBuffer())
  const meta = await sharp(sourceBuffer, { animated: true }).metadata()
  const pageCount = meta.pages ?? 1

  if (pageCount > 50) {
    throw new ConversionError('TIFF exceeds 50 pages')
  }

  const baseName = path.basename(storageKey, path.extname(storageKey))
  const outputKeys: string[] = []

  for (let i = 0; i < pageCount; i += 1) {
    try {
      const png = await sharp(sourceBuffer, { page: i, density: 150 }).png().toBuffer()
      const outputKey = `health-uploads/${userId}/${baseName}_page_${i + 1}.png`

      const { error: uploadError } = await bucket.upload(outputKey, png, {
        contentType: 'image/png',
        upsert: true,
      })

      if (uploadError) {
        console.error('[health-tiff] Failed to upload PNG page:', outputKey, uploadError)
        continue
      }

      outputKeys.push(outputKey)
    } catch (err: unknown) {
      console.error(`[health-tiff] Failed converting TIFF page ${i + 1}:`, err)
    }
  }

  if (outputKeys.length > 0) {
    const { error: removeError } = await bucket.remove([storageKey])
    if (removeError) {
      console.error('[health-tiff] Failed to delete original TIFF:', removeError)
    }
  }

  return outputKeys
}
