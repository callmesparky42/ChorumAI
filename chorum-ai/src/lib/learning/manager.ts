/**
 * Learning Manager
 * CRUD operations for learning items, confidence scores, and file metadata.
 */

import { db } from '@/lib/db'
import { projectLearningPaths, projectConfidence, projectFileMetadata } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type {
    LearningType,
    LearningItem,
    LearningItemMetadata,
    ConfidenceMetric,
    CreateLearningItemInput,
    UpdateLearningItemInput,
    SetCriticalFileInput
} from './types'

// ============================================================================
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
    const [inserted] = await db.insert(projectLearningPaths)
        .values({
            projectId: input.projectId,
            type: input.type,
            content: input.content,
            context: input.context,
            metadata: input.metadata
        })
        .returning()

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

    return updated as LearningItem | null
}

/**
 * Delete a learning item.
 */
export async function deleteLearningItem(id: string): Promise<boolean> {
    const result = await db.delete(projectLearningPaths)
        .where(eq(projectLearningPaths.id, id))
        .returning()

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
    let score = metric.score
    const decayRate = metric.decayRate
    let lastDecayAt = metric.lastDecayAt ? new Date(metric.lastDecayAt) : now

    // 1. Apply Time-Based Decay
    const msPerDay = 1000 * 60 * 60 * 24
    const daysSince = (now.getTime() - lastDecayAt.getTime()) / msPerDay

    if (daysSince >= 1) {
        // Apply exponential decay: NewScore = OldScore * (Rate ^ Days)
        score = score * Math.pow(decayRate, Math.floor(daysSince))
        lastDecayAt = now
    }

    // 2. Apply Interaction Score
    if (isPositive) {
        score = Math.min(100, score + 0.5)
    } else {
        score = Math.max(0, score - 2.0)
    }

    // 3. Update DB
    await db.update(projectConfidence)
        .set({
            score: score.toFixed(2),
            lastDecayAt: lastDecayAt,
            interactionCount: (metric.interactionCount || 0) + 1,
            positiveInteractionCount: (metric.positiveInteractionCount || 0) + (isPositive ? 1 : 0),
            updatedAt: now
        })
        .where(eq(projectConfidence.id, metric.id))
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
