import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { CONFIDENCE_FLOOR, HALF_LIFE_DAYS } from '@/lib/core'
import type { LearningType } from '@/lib/nebula/types'
import type { UserCustomization } from './types'
import { UserCustomizationSchema } from './types'

export async function getUserCustomization(userId: string): Promise<UserCustomization> {
  const [row] = await db
    .select({ customization: userSettings.customization })
    .from(userSettings)
    .where(eq(userSettings.id, userId))

  if (!row) return {}

  const parsed = UserCustomizationSchema.safeParse(row.customization)
  return parsed.success ? parsed.data : {}
}

export async function getEffectiveHalfLife(
  userId: string,
  type: LearningType,
): Promise<number | undefined> {
  const config = await getUserCustomization(userId)
  return config.halfLifeOverrides?.[type] ?? HALF_LIFE_DAYS[type]
}

export async function getEffectiveConfidenceFloor(
  userId: string,
  type: LearningType,
): Promise<number> {
  const config = await getUserCustomization(userId)
  return config.confidenceFloorOverrides?.[type] ?? CONFIDENCE_FLOOR[type] ?? 0
}

export async function getEffectiveQualityThreshold(userId: string): Promise<number> {
  const config = await getUserCustomization(userId)
  return config.qualityThreshold ?? 0.35
}

export async function updateUserCustomization(
  userId: string,
  updates: Partial<UserCustomization>,
): Promise<UserCustomization> {
  const current = await getUserCustomization(userId)

  const merged: UserCustomization = {
    ...current,
    ...updates,
    halfLifeOverrides: updates.halfLifeOverrides !== undefined
      ? { ...current.halfLifeOverrides, ...updates.halfLifeOverrides }
      : current.halfLifeOverrides,
    confidenceFloorOverrides: updates.confidenceFloorOverrides !== undefined
      ? { ...current.confidenceFloorOverrides, ...updates.confidenceFloorOverrides }
      : current.confidenceFloorOverrides,
  }

  const validated = UserCustomizationSchema.parse(merged)

  await db
    .insert(userSettings)
    .values({
      id: userId,
      customization: validated,
    })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: {
        customization: validated,
        updatedAt: new Date(),
      },
    })

  return validated
}
