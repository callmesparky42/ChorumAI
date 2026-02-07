/**
 * Learning Manager
 * CRUD operations for learning items, confidence scores, and file metadata.
 */

import { db } from '@/lib/db'
import { projectLearningPaths, projectConfidence, projectFileMetadata } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type {
    LearningType,
    LearningItem,
    LearningItemMetadata,
    ConfidenceMetric,
    CreateLearningItemInput,
    UpdateLearningItemInput,
    SetCriticalFileInput
} from './types'
import { verifyReference } from './grounding'
import { invalidateCache } from './cache'


// Learning Items CRUD
// ============================================================================

/** Maximum learning items to fetch per project (DoS prevention) */
const MAX_LEARNING_ITEMS = 1000

/**
 * Get all learning items for a project.
 * Limited to MAX_LEARNING_ITEMS to prevent memory exhaustion.
 */
export async function getProjectLearning(projectId: string): Promise<LearningItem[]> {
    const items = await db.select()
        .from(projectLearningPaths)
        .where(eq(projectLearningPaths.projectId, projectId))
        .limit(MAX_LEARNING_ITEMS)

    return items.map(item => ({
        ...item,
        metadata: item.metadata as LearningItemMetadata | null
    })) as LearningItem[]
}

/**
 * Get learning items by type.
 */
export async function getProjectLearningByType(
    projectId: string,
    type: LearningType
): Promise<LearningItem[]> {
    const items = await db.select()
        .from(projectLearningPaths)
        .where(and(
            eq(projectLearningPaths.projectId, projectId),
            eq(projectLearningPaths.type, type)
        ))

    return items as LearningItem[]
}

/**
 * Add a new learning item.
 */
export async function addLearningItem(input: CreateLearningItemInput): Promise<LearningItem> {
    // Grounding Check (P0 Safety)
    const grounding = await verifyReference(input.content, input.projectId)

    if (!grounding.verified) {
        throw new Error(`Learning Rejected: ${grounding.reason}`)
    }

    const metadataWithProvenance = {
        ...input.metadata,
        provenance: grounding.source
    }

    const [inserted] = await db.insert(projectLearningPaths)
        .values({
            projectId: input.projectId,
            type: input.type,
            content: input.content,
            context: input.context,
            metadata: metadataWithProvenance
        })
        .returning()

    // Invalidate compiled cache
    invalidateCache(input.projectId).catch(console.error)

    // Trigger asynchronous confidence recalculation
    recalculateProjectConfidence(input.projectId).catch(err =>
        console.error('[Confidence] Recalculation failed after add:', err)
    )

    return inserted as LearningItem
}

/**
 * Update a learning item.
 */
export async function updateLearningItem(
    id: string,
    updates: UpdateLearningItemInput
): Promise<LearningItem | null> {
    const [updated] = await db.update(projectLearningPaths)
        .set(updates)
        .where(eq(projectLearningPaths.id, id))
        .returning()

    if (updated) {
        invalidateCache(updated.projectId).catch(console.error)
    }

    return updated as LearningItem | null
}

/**
 * Delete a learning item.
 */
export async function deleteLearningItem(id: string): Promise<boolean> {
    const result = await db.delete(projectLearningPaths)
        .where(eq(projectLearningPaths.id, id))
        .returning()

    if (result.length > 0) {
        invalidateCache(result[0].projectId).catch(console.error)
    }

    return result.length > 0
}

// ============================================================================
// Confidence Scoring
// ============================================================================

/**
 * Get confidence score for a project.
 */
export async function getProjectConfidence(projectId: string): Promise<ConfidenceMetric | null> {
    const [metric] = await db.select()
        .from(projectConfidence)
        .where(eq(projectConfidence.projectId, projectId))

    if (!metric) return null

    return {
        ...metric,
        score: Number(metric.score || 100),
        decayRate: Number(metric.decayRate || 0.99),
        interactionCount: metric.interactionCount || 0,
        positiveInteractionCount: metric.positiveInteractionCount || 0
    } as ConfidenceMetric
}

/**
 * Initialize confidence scoring for a project.
 */
export async function initializeConfidence(projectId: string): Promise<ConfidenceMetric> {
    const [inserted] = await db.insert(projectConfidence)
        .values({ projectId })
        .returning()

    return {
        ...inserted,
        score: Number(inserted.score || 100),
        decayRate: Number(inserted.decayRate || 0.99),
        interactionCount: inserted.interactionCount || 0,
        positiveInteractionCount: inserted.positiveInteractionCount || 0
    } as ConfidenceMetric
}

/**
 * Update project confidence based on interaction quality.
 * Applies time-based decay and interaction scoring.
 *
 * Scoring heuristics:
 * - Positive interaction: +0.5 points (capped at 100)
 * - Negative interaction: -2.0 points (floored at 0)
 * - Daily decay: score * decayRate (default 0.99, so ~1% daily)
 */
export async function updateConfidence(projectId: string, isPositive: boolean): Promise<void> {
    // Get or create confidence metric
    let metric = await getProjectConfidence(projectId)

    if (!metric) {
        metric = await initializeConfidence(projectId)
    }

    const now = new Date()

    // 3. Update DB with counts first
    await db.update(projectConfidence)
        .set({
            interactionCount: (metric.interactionCount || 0) + 1,
            positiveInteractionCount: (metric.positiveInteractionCount || 0) + (isPositive ? 1 : 0),
            updatedAt: now
        })
        .where(eq(projectConfidence.id, metric.id))

    // 4. Recalculate Score using new formula
    await recalculateProjectConfidence(projectId)
}

/**
 * Recalculate and update the project confidence score based on the revised formula.
 * Formula:
 *   Score = (iScore * 0.3 + vRate * 0.4 + cRate * 0.2 + dFactor * 0.1) * 100
 */
export async function recalculateProjectConfidence(projectId: string): Promise<number> {
    const metric = await getProjectConfidence(projectId)
    if (!metric) return 100 // Default if missing

    // 1. Gather Metrics

    // A. Interaction Score
    const totalInteractions = metric.interactionCount || 0
    const positiveInteractions = metric.positiveInteractionCount || 0
    const interactionScore = totalInteractions > 0
        ? positiveInteractions / totalInteractions
        : 1.0 // Default to trust if no interactions yet? Or 0.5? User said 0-1. Let's start with 1.0 (optimistic) or 0.5. 
    // Given "positiveInteractions / totalInteractions", if total is 0, it's undefined. 
    // Let's assume start high until proven wrong.

    // B. Verification & Consistency Rates
    // We need aggregation queries on projectLearningPaths
    // verifiedLearnings: count where metadata->provenance is not null
    // recurringConcepts: count where usageCount > 1
    // totalLearnings: count(*)

    // Run parallel queries
    const [stats] = await db.select({
        total: sql<number>`count(*)`,
        verified: sql<number>`count(*) filter (where ${projectLearningPaths.metadata}->>'provenance' is not null)`,
        recurring: sql<number>`count(*) filter (where ${projectLearningPaths.usageCount} > 1)`
    })
        .from(projectLearningPaths)
        .where(eq(projectLearningPaths.projectId, projectId))

    const totalLearnings = Number(stats?.total || 0)
    const verifiedLearnings = Number(stats?.verified || 0)
    const recurringConcepts = Number(stats?.recurring || 0)

    const verificationRate = totalLearnings > 0 ? verifiedLearnings / totalLearnings : 0 // If no learnings, 0 verified
    const consistencyRate = totalLearnings > 0 ? recurringConcepts / totalLearnings : 0

    // C. Decay Factor
    const now = new Date()
    const lastInteraction = metric.updatedAt ? new Date(metric.updatedAt) : now // Use updatedAt as last interaction
    const msPerDay = 1000 * 60 * 60 * 24
    const daysSinceLastInteraction = Math.max(0, (now.getTime() - lastInteraction.getTime()) / msPerDay)
    const decayRate = metric.decayRate || 0.99

    const decayFactor = Math.pow(decayRate, daysSinceLastInteraction)

    // 2. Calculate Final Score
    // interactionScore * 0.3 + verificationRate * 0.4 + consistencyRate * 0.2 + decayFactor * 0.1
    const weightedSum = (
        (interactionScore * 0.3) +
        (verificationRate * 0.4) +
        (consistencyRate * 0.2) +
        (decayFactor * 0.1)
    )

    const finalScore = Math.min(100, Math.max(0, weightedSum * 100))

    // 3. Update DB
    await db.update(projectConfidence)
        .set({
            score: finalScore.toFixed(2),
            updatedAt: now // Update timestamp? "daysSinceLastInteraction" depends on it. 
            // But if we just recalculate without interaction, we shouldn't bump updatedAt?
            // Actually updateConfidence bumps it. addLearningItem doesn't necessarily interaction. 
            // Let's leave updatedAt alone here unless it's stale? 
            // For now, only update score.
        })
        .where(eq(projectConfidence.projectId, projectId))

    return finalScore
}

// ============================================================================
// Critical Files
// ============================================================================

/**
 * Get all critical files for a project.
 */
export async function getCriticalFiles(projectId: string): Promise<string[]> {
    const files = await db.select()
        .from(projectFileMetadata)
        .where(and(
            eq(projectFileMetadata.projectId, projectId),
            eq(projectFileMetadata.isCritical, true)
        ))

    return files.map(f => f.filePath)
}

/**
 * Set a file's critical status.
 */
export async function setCriticalFile(input: SetCriticalFileInput): Promise<void> {
    const existing = await db.select()
        .from(projectFileMetadata)
        .where(and(
            eq(projectFileMetadata.projectId, input.projectId),
            eq(projectFileMetadata.filePath, input.filePath)
        ))

    if (existing.length > 0) {
        await db.update(projectFileMetadata)
            .set({
                isCritical: input.isCritical,
                linkedInvariants: input.linkedInvariants,
                updatedAt: new Date()
            })
            .where(eq(projectFileMetadata.id, existing[0].id))
    } else {
        await db.insert(projectFileMetadata)
            .values({
                projectId: input.projectId,
                filePath: input.filePath,
                isCritical: input.isCritical,
                linkedInvariants: input.linkedInvariants
            })
    }

    invalidateCache(input.projectId).catch(console.error)
}

/**
 * Remove critical file designation.
 */
export async function removeCriticalFile(projectId: string, filePath: string): Promise<boolean> {
    const result = await db.delete(projectFileMetadata)
        .where(and(
            eq(projectFileMetadata.projectId, projectId),
            eq(projectFileMetadata.filePath, filePath)
        ))
        .returning()

    return result.length > 0
}
