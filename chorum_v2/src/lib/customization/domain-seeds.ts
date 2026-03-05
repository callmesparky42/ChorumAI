import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { domainClusters, domainSeeds } from '@/db/schema'

export const CreateSeedSchema = z.object({
  label: z.string().min(1).max(50).refine(
    (value) => value !== 'general',
    { message: "The label 'general' is forbidden — domains must be specific" },
  ),
  signalKeywords: z.array(z.string().min(1)),
  preferredTypes: z.record(z.string(), z.number().min(0).max(1)),
  isSystem: z.boolean().default(false),
})

export type CreateSeedInput = z.infer<typeof CreateSeedSchema>

export const UpdateSeedSchema = z.object({
  label: z.string().min(1).max(50).refine(
    (value) => value !== 'general',
    { message: "The label 'general' is forbidden — domains must be specific" },
  ).optional(),
  signalKeywords: z.array(z.string().min(1)).optional(),
  preferredTypes: z.record(z.string(), z.number().min(0).max(1)).optional(),
})

export type UpdateSeedInput = z.infer<typeof UpdateSeedSchema>

export async function listSeeds() {
  return db.select().from(domainSeeds)
}

export async function getSeed(id: string) {
  const [row] = await db.select().from(domainSeeds).where(eq(domainSeeds.id, id))
  return row ?? null
}

export async function createSeed(input: CreateSeedInput) {
  const parsed = CreateSeedSchema.parse(input)
  const [row] = await db
    .insert(domainSeeds)
    .values({
      label: parsed.label,
      signalKeywords: parsed.signalKeywords,
      preferredTypes: parsed.preferredTypes,
      isSystem: parsed.isSystem,
    })
    .returning()

  return row
}

export async function updateSeed(id: string, input: UpdateSeedInput) {
  const parsed = UpdateSeedSchema.parse(input)
  const updates: Record<string, unknown> = {}

  if (parsed.label !== undefined) updates.label = parsed.label
  if (parsed.signalKeywords !== undefined) updates.signalKeywords = parsed.signalKeywords
  if (parsed.preferredTypes !== undefined) updates.preferredTypes = parsed.preferredTypes

  if (Object.keys(updates).length === 0) return getSeed(id)

  const [row] = await db
    .update(domainSeeds)
    .set(updates)
    .where(eq(domainSeeds.id, id))
    .returning()

  return row ?? null
}

export async function deleteSeed(id: string) {
  const seed = await getSeed(id)
  if (!seed) return false
  if (seed.isSystem) {
    throw new Error('Cannot delete system seeds — disable or rename instead')
  }

  await db.delete(domainSeeds).where(eq(domainSeeds.id, id))
  return true
}

export async function listClusters(userId: string) {
  return db.select().from(domainClusters).where(eq(domainClusters.userId, userId))
}

export async function getCluster(id: string) {
  const [row] = await db.select().from(domainClusters).where(eq(domainClusters.id, id))
  return row ?? null
}
