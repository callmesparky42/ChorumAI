/**
 * Data Portability Validator
 * Validates the schema of imported JSON files using Zod.
 */

import { z } from 'zod'
import { ExportPayload } from './types'

// Zod Schemas for Validation

const MetadataSchema = z.object({
    exportVersion: z.string(),
    exportedAt: z.string(),
    chorumVersion: z.string().optional(),
    source: z.string(),
})

const ProjectSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    techStack: z.array(z.string()).nullable(),
    customInstructions: z.string().nullable(),
})

const LearningItemSchema = z.object({
    id: z.string(),
    content: z.string(),
    context: z.string().nullable(),
    metadata: z.record(z.string(), z.any()).nullable(),
    createdAt: z.string().nullable(),
})

const ConfidenceSchema = z.object({
    score: z.string(),
    decayRate: z.string(),
    interactionCount: z.number(),
    positiveInteractionCount: z.number(),
    lastDecayAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
})

const FileMetadataSchema = z.object({
    filePath: z.string(),
    isCritical: z.boolean(),
    linkedInvariants: z.array(z.string()).nullable(),
    updatedAt: z.string().nullable(),
})

const MemorySummarySchema = z.object({
    summary: z.string(),
    messageCount: z.number(),
    fromDate: z.string(),
    toDate: z.string(),
    createdAt: z.string().nullable(),
})

// Loose schema for AgentDefinition (complex object, just validating basics)
const AgentConfigSchema = z.object({
    role: z.string(),
    tier: z.enum(['reasoning', 'balanced', 'fast']),
    personality: z.object({
        tone: z.string(),
    }).optional(),
}).passthrough()

const CustomAgentSchema = z.object({
    name: z.string(),
    config: AgentConfigSchema,
    createdAt: z.string().nullable(),
})

const MessageSchema = z.object({
    role: z.string(),
    content: z.string(),
    provider: z.string().nullable(),
    costUsd: z.string().nullable(),
    images: z.array(z.string()).nullable(),
    createdAt: z.string().nullable(),
})

const ConversationSchema = z.object({
    title: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    messages: z.array(MessageSchema),
})

const LinkSchema = z.object({
    id: z.string(),
    fromId: z.string(),
    toId: z.string(),
    linkType: z.string(),
    strength: z.string(),
    source: z.string(),
    createdAt: z.string().nullable(),
})

const CooccurrenceSchema = z.object({
    itemA: z.string(),
    itemB: z.string(),
    count: z.number(),
    positiveCount: z.number(),
    lastSeen: z.string().nullable(),
})

export const ExportPayloadSchema = z.object({
    metadata: MetadataSchema,
    project: ProjectSchema,
    learning: z.object({
        patterns: z.array(LearningItemSchema),
        antipatterns: z.array(LearningItemSchema),
        decisions: z.array(LearningItemSchema),
        invariants: z.array(LearningItemSchema),
        goldenPaths: z.array(LearningItemSchema),
        links: z.array(LinkSchema),
        cooccurrences: z.array(CooccurrenceSchema),
    }),
    confidence: ConfidenceSchema.nullable(),
    criticalFiles: z.array(FileMetadataSchema),
    memorySummaries: z.array(MemorySummarySchema),
    customAgents: z.array(CustomAgentSchema),
    conversations: z.array(ConversationSchema).optional(),
})

export function validateExportPayload(data: unknown): { valid: boolean; error?: string; data?: ExportPayload } {
    const result = ExportPayloadSchema.safeParse(data)
    if (!result.success) {
        // Handle both Zod v3 and v4 error formats
        const issues = result.error.issues || []
        const errorMsg = issues.length > 0
            ? issues.map((e: any) =>
                `${(e.path || []).join('.')}: ${e.message || 'Invalid'}`
            ).join(', ')
            : result.error.message || 'Validation failed'
        return { valid: false, error: errorMsg }
    }
    return { valid: true, data: result.data as unknown as ExportPayload }
}
