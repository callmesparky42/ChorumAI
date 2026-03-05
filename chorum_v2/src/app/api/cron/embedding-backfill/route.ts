import { NextResponse } from 'next/server'
import { createNebula } from '@/lib/nebula'
import { computeEmbedding } from '@/lib/customization/extraction'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Unconfigured' }, { status: 500 })
  }
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nebula = createNebula()
  const missing = await nebula.getLearningsWithoutEmbedding(1536, 50)

  let processed = 0
  for (const learning of missing) {
    try {
      const embedding = await computeEmbedding(learning.content)
      if (embedding.length > 0) {
        await nebula.setEmbedding(learning.id, embedding, 1536, 'text-embedding-3-small')
        processed += 1
      }
    } catch {
      // Continue processing remaining learnings.
    }
  }

  return NextResponse.json({ processed, total: missing.length })
}
