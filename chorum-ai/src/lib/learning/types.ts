/**
 * Learning System Types
 * Defines the structure for patterns, invariants, antipatterns, decisions, and golden paths.
 */

export type LearningType = 'pattern' | 'antipattern' | 'decision' | 'invariant' | 'golden_path'

export type InvariantCheckType = 'keyword' | 'regex' | 'contains' | 'not_contains'

export interface LearningItemMetadata {
    /** How to check this invariant */
    checkType?: InvariantCheckType
    /** Value to check for (if different from content) */
    checkValue?: string
    /** Whether this is a negative rule (default true for invariants) */
    isNegativeRule?: boolean
    /** Source message ID that triggered learning this item */
    sourceMessageId?: string
    /** User who taught this */
    learnedFromUser?: string
    /** Provenance data (Source Tagging) */
    provenance?: {
        conversationId: string
        messageIds: string[]
        turnRange?: [number, number]
        verifiedAt: string // ISO date
    }
    /** Additional context */
    [key: string]: unknown
}

export interface LearningItem {
    id: string
    projectId: string
    type: LearningType
    content: string
    context?: string | null
    metadata?: LearningItemMetadata | null
    // Relevance Gating
    embedding?: number[] | null
    domains?: string[] | null
    usageCount?: number
    lastUsedAt?: Date | null
    promotedAt?: Date | null
    createdAt: Date | null
}

export interface ConfidenceMetric {
    id: string
    projectId: string
    score: number
    decayRate: number
    lastDecayAt: Date | null
    interactionCount: number | null
    positiveInteractionCount: number | null
    updatedAt: Date | null
}

export interface FileMetadata {
    id: string
    projectId: string
    filePath: string
    isCritical: boolean
    linkedInvariants: string[] | null
    updatedAt: Date | null
}

/** Input for creating a new learning item */
export interface CreateLearningItemInput {
    projectId: string
    type: LearningType
    content: string
    context?: string
    metadata?: LearningItemMetadata
}

/** Input for updating a learning item */
export interface UpdateLearningItemInput {
    content?: string
    context?: string
    metadata?: LearningItemMetadata
}

/** Input for marking a file as critical */
export interface SetCriticalFileInput {
    projectId: string
    filePath: string
    isCritical: boolean
    linkedInvariants?: string[]
}
