/**
 * Data Portability Importer
 * Imports a project export into the database, handling ID remapping and duplicates.
 */

import { db } from '@/lib/db'
import {
    projects,
    projectLearningPaths,
    projectConfidence,
    projectFileMetadata,
    memorySummaries,
    customAgents,
    conversations,
    messages
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ExportPayload, ImportOptions, ImportResult } from './types'

export async function importProject(userId: string, data: ExportPayload, options: ImportOptions): Promise<ImportResult> {
    return await db.transaction(async (tx) => {
        const stats = {
            patternsImported: 0,
            invariantsImported: 0,
            agentsImported: 0,
            conversationsImported: 0,
            filesImported: 0
        }
        const warnings: string[] = []
        const idMap = new Map<string, string>() // Old ID -> New ID

        // 1. Create Project
        // Handle name collision
        let projectName = data.project.name
        if (!options.mergeExisting) {
            const existing = await tx.query.projects.findFirst({
                where: and(eq(projects.name, projectName), eq(projects.userId, userId))
            })
            if (existing) {
                projectName = `${projectName} (Imported ${new Date().toLocaleDateString()})`
            }
        } else {
            // If mergeExisting is true, look for existing project
            const existing = await tx.query.projects.findFirst({
                where: and(eq(projects.name, projectName), eq(projects.userId, userId))
            })
            if (existing) {
                // We'll reuse this project ID
                // But we still map the old export ID to this existing ID for linking
                idMap.set(data.project.id, existing.id)
            }
        }

        let projectId = idMap.get(data.project.id)

        if (!projectId) {
            const [newProject] = await tx.insert(projects).values({
                userId,
                name: projectName,
                description: data.project.description,
                techStack: data.project.techStack,
                customInstructions: data.project.customInstructions
            }).returning()
            projectId = newProject.id
            idMap.set(data.project.id, projectId)
        }

        // 2. Import Learning Items
        const allLearning = [
            ...data.learning.patterns.map(i => ({ ...i, type: 'pattern' })),
            ...data.learning.antipatterns.map(i => ({ ...i, type: 'antipattern' })),
            ...data.learning.decisions.map(i => ({ ...i, type: 'decision' })),
            ...data.learning.invariants.map(i => ({ ...i, type: 'invariant' })),
            ...data.learning.goldenPaths.map(i => ({ ...i, type: 'golden_path' }))
        ]

        for (const item of allLearning) {
            // Check for duplicates in this project (by content + type) to avoid spamming
            const existing = await tx.query.projectLearningPaths.findFirst({
                where: and(
                    eq(projectLearningPaths.projectId, projectId!),
                    eq(projectLearningPaths.type, item.type),
                    eq(projectLearningPaths.content, item.content)
                )
            })

            if (!existing) {
                const [newItem] = await tx.insert(projectLearningPaths).values({
                    projectId: projectId!,
                    type: item.type,
                    content: item.content,
                    context: item.context,
                    metadata: item.metadata
                }).returning()

                // Map old item ID to new item ID (important for critical file linking)
                idMap.set(item.id, newItem.id)

                if (item.type === 'pattern') stats.patternsImported++
                if (item.type === 'invariant') stats.invariantsImported++
            } else {
                // If exists, map old ID to existing ID
                idMap.set(item.id, existing.id)
            }
        }

        // 3. Import Confidence
        if (data.confidence) {
            // Delete existing confidence if any (replace strategy)
            await tx.delete(projectConfidence).where(eq(projectConfidence.projectId, projectId!))

            await tx.insert(projectConfidence).values({
                projectId: projectId!,
                score: data.confidence.score,
                decayRate: data.confidence.decayRate,
                interactionCount: data.confidence.interactionCount,
                positiveInteractionCount: data.confidence.positiveInteractionCount,
                lastDecayAt: data.confidence.lastDecayAt ? new Date(data.confidence.lastDecayAt) : null
            })
        }

        // 4. Import Critical Files
        for (const file of data.criticalFiles) {
            // Remap linked invariants
            const newLinkedIds = (file.linkedInvariants || [])
                .map(oldId => idMap.get(oldId))
                .filter(id => id !== undefined) as string[]

            const existing = await tx.query.projectFileMetadata.findFirst({
                where: and(
                    eq(projectFileMetadata.projectId, projectId!),
                    eq(projectFileMetadata.filePath, file.filePath)
                )
            })

            if (!existing) {
                await tx.insert(projectFileMetadata).values({
                    projectId: projectId!,
                    filePath: file.filePath,
                    isCritical: file.isCritical,
                    linkedInvariants: newLinkedIds
                })
                stats.filesImported++
            }
        }

        // 5. Import Memory Summaries
        for (const summary of data.memorySummaries) {
            // Always append summaries? Or de-dupe?
            // Simple de-dupe by date range
            const existing = await tx.query.memorySummaries.findFirst({
                where: and(
                    eq(memorySummaries.projectId, projectId!),
                    eq(memorySummaries.fromDate, new Date(summary.fromDate)),
                    eq(memorySummaries.toDate, new Date(summary.toDate))
                )
            })

            if (!existing) {
                await tx.insert(memorySummaries).values({
                    projectId: projectId!,
                    summary: summary.summary,
                    messageCount: summary.messageCount,
                    fromDate: new Date(summary.fromDate),
                    toDate: new Date(summary.toDate)
                })
            }
        }

        // 6. Import Agents (optional)
        // These are user-level, so check if agent name exists for this user
        if (data.customAgents) {
            for (const agent of data.customAgents) {
                const existing = await tx.query.customAgents.findFirst({
                    where: and(
                        eq(customAgents.userId, userId),
                        eq(customAgents.name, agent.name)
                    )
                })

                if (!existing) {
                    await tx.insert(customAgents).values({
                        userId,
                        name: agent.name,
                        config: agent.config
                    })
                    stats.agentsImported++
                } else {
                    warnings.push(`Skipped agent "${agent.name}" (already exists)`)
                }
            }
        }

        // 7. Import Conversations (optional)
        if (options.importConversations && data.conversations) {
            for (const convo of data.conversations) {
                const [newConvo] = await tx.insert(conversations).values({
                    projectId: projectId!,
                    title: convo.title
                }).returning()

                if (convo.messages && convo.messages.length > 0) {
                    await tx.insert(messages).values(
                        convo.messages.map(msg => ({
                            projectId: projectId!,
                            conversationId: newConvo.id,
                            role: msg.role as 'user' | 'assistant',
                            content: msg.content,
                            provider: msg.provider,
                            costUsd: msg.costUsd,
                            images: msg.images
                        }))
                    )
                }
                stats.conversationsImported++
            }
        }

        return {
            success: true,
            projectId: projectId!,
            stats,
            warnings
        }
    })
}
