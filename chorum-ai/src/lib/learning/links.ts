import { db } from '@/lib/db'
import { learningLinks, projectLearningPaths } from '@/lib/db/schema'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

// Types
export type LinkType = 'supports' | 'contradicts' | 'supersedes' | 'protects'
export type LinkSource = 'inferred' | 'co-occurrence' | 'user'

export type CreateLinkInput = {
    projectId: string
    fromId: string
    toId: string
    linkType: LinkType
    strength?: number
    source?: LinkSource
}

export type UpdateLinkInput = {
    strength?: number
    linkType?: LinkType
}

/**
 * createLink
 * Creates a new directional link between learning items.
 * Enforces uniqueness via schema constraint (fromId, toId, linkType).
 */
export async function createLink(input: CreateLinkInput) {
    // 1. Validate inputs
    if (input.fromId === input.toId) {
        throw new Error('Cannot link an item to itself')
    }

    // 2. Insert
    const [link] = await db.insert(learningLinks)
        .values({
            projectId: input.projectId,
            fromId: input.fromId,
            toId: input.toId,
            linkType: input.linkType,
            strength: input.strength?.toString() || '0.5',
            source: input.source || 'inferred'
        })
        .onConflictDoUpdate({
            target: [learningLinks.fromId, learningLinks.toId, learningLinks.linkType],
            set: {
                strength: input.strength?.toString() || '0.5',
                updatedAt: new Date()
            }
        })
        .returning()

    return link
}

/**
 * getLinksForItems
 * Retrieves all links where any of the given item IDs are either source or target.
 */
export async function getLinksForItems(projectId: string, itemIds: string[]) {
    if (itemIds.length === 0) return []

    const links = await db.select()
        .from(learningLinks)
        .where(and(
            eq(learningLinks.projectId, projectId),
            or(
                inArray(learningLinks.fromId, itemIds),
                inArray(learningLinks.toId, itemIds)
            )
        ))

    return links
}

/**
 * getLinksForProject
 * Get all links for a project (useful for exports)
 */
export async function getLinksForProject(projectId: string) {
    return db.select()
        .from(learningLinks)
        .where(eq(learningLinks.projectId, projectId))
}

/**
 * updateLink
 * Updates the strength or type of an existing link.
 */
export async function updateLink(linkId: string, updates: UpdateLinkInput) {
    const [updated] = await db.update(learningLinks)
        .set({
            ...updates,
            strength: updates.strength?.toString(),
            updatedAt: new Date()
        })
        .where(eq(learningLinks.id, linkId))
        .returning()

    return updated
}

/**
 * deleteLink
 */
export async function deleteLink(linkId: string) {
    const [deleted] = await db.delete(learningLinks)
        .where(eq(learningLinks.id, linkId))
        .returning()

    return !!deleted
}
