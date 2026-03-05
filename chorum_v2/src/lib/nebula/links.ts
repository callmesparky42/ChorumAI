// src/lib/nebula/links.ts
import { db } from '@/db'
import { learningLinks } from '@/db/schema'
import { or, eq } from 'drizzle-orm'
import type { LearningLink, LinkType } from './types'

function rowToLink(row: typeof learningLinks.$inferSelect): LearningLink {
  return {
    id:        row.id,
    sourceId:  row.sourceId,
    targetId:  row.targetId,
    linkType:  row.linkType as LinkType,
    strength:  row.strength,
    createdAt: row.createdAt,
  }
}

export async function createLink(
  sourceId: string,
  targetId: string,
  type:     LinkType,
  strength: number,
): Promise<void> {
  await db.insert(learningLinks).values({ sourceId, targetId, linkType: type, strength })
}

export async function getLinksFor(learningId: string): Promise<LearningLink[]> {
  const rows = await db
    .select()
    .from(learningLinks)
    .where(or(eq(learningLinks.sourceId, learningId), eq(learningLinks.targetId, learningId)))

  return rows.map(rowToLink)
}