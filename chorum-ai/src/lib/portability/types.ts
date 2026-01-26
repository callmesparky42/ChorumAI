/**
 * Data Portability Types
 * Defines the shape of the exported project data.
 */

import { AgentDefinition } from '@/lib/agents/types'

export const EXPORT_VERSION = '1.0.0'

export interface ExportMetadata {
    exportVersion: string
    exportedAt: string // ISO timestamp
    chorumVersion?: string
    source: string // 'chorum-web'
}

export interface ExportedProject {
    id: string // Original ID
    name: string
    description: string | null
    techStack: string[] | null
    customInstructions: string | null
}

export interface ExportedLearningItem {
    id: string // Original ID
    content: string
    context: string | null
    metadata: Record<string, unknown> | null
    createdAt: string | null
}

export interface ExportedConfidence {
    score: string
    decayRate: string
    interactionCount: number
    positiveInteractionCount: number
    lastDecayAt: string | null
    updatedAt: string | null
}

export interface ExportedFileMetadata {
    filePath: string
    isCritical: boolean
    linkedInvariants: string[] | null
    updatedAt: string | null
}

export interface ExportedMemorySummary {
    summary: string
    messageCount: number
    fromDate: string
    toDate: string
    createdAt: string | null
}

export interface ExportedCustomAgent {
    name: string
    config: AgentDefinition
    createdAt: string | null
}

export interface ExportedMessage {
    role: string
    content: string
    provider: string | null
    costUsd: string | null
    images: string[] | null
    createdAt: string | null
}

export interface ExportedConversation {
    title: string | null
    createdAt: string | null
    updatedAt: string | null
    messages: ExportedMessage[]
}

export interface ExportedLink {
    id: string
    fromId: string // References original ID
    toId: string   // References original ID
    linkType: string
    strength: string
    source: string
    createdAt: string | null
}

export interface ExportedCooccurrence {
    itemA: string // References original ID
    itemB: string // References original ID
    count: number
    positiveCount: number
    lastSeen: string | null
}

export interface ExportPayload {
    metadata: ExportMetadata
    project: ExportedProject
    learning: {
        patterns: ExportedLearningItem[]
        antipatterns: ExportedLearningItem[]
        decisions: ExportedLearningItem[]
        invariants: ExportedLearningItem[]
        goldenPaths: ExportedLearningItem[]
        links: ExportedLink[]
        cooccurrences: ExportedCooccurrence[]
    }
    confidence: ExportedConfidence | null
    criticalFiles: ExportedFileMetadata[]
    memorySummaries: ExportedMemorySummary[]
    customAgents: ExportedCustomAgent[]
    conversations?: ExportedConversation[]
}

export interface ImportOptions {
    mergeExisting?: boolean
    importConversations?: boolean
}

export interface ImportResult {
    success: boolean
    projectId: string
    warnings: string[]
    stats: {
        patternsImported: number
        invariantsImported: number
        agentsImported: number
        conversationsImported: number
        filesImported: number
        linksImported: number
    }
}
