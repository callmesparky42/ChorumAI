import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { domainClusters, domainSeeds } from '@/db/schema'

export async function detectScopes(text: string, userId: string): Promise<string[]> {
  const seeds = await db.select().from(domainSeeds)
  const lower = text.toLowerCase()
  const detected: string[] = []

  for (const seed of seeds) {
    const keywords = seed.signalKeywords as string[]
    const matchCount = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length
    if (matchCount >= 2) {
      detected.push(`#${seed.label}`)
    }
  }

  const clusters = await db
    .select()
    .from(domainClusters)
    .where(eq(domainClusters.userId, userId))

  for (const cluster of clusters) {
    const tags = cluster.scopeTags as string[]
    const matchCount = tags.filter((tag) => lower.includes(tag.replace('#', '').toLowerCase())).length
    if (matchCount >= 1) {
      detected.push(...tags.filter((tag) => !detected.includes(tag)))
    }
  }

  return [...new Set(detected)]
}
