import { db } from '@/lib/db'
import { projects, projectLearningPaths } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { embeddings } from '@/lib/chorum/embeddings'
import { relevance, MemoryCandidate } from '@/lib/chorum/relevance'
import type { QueryMemoryInput, QueryMemoryOutput, McpContext, LearningType } from '../types'

export async function queryMemory(
  input: QueryMemoryInput,
  ctx: McpContext
): Promise<QueryMemoryOutput> {
  // Verify project access
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.userId, ctx.userId)
      )
    )
    .limit(1)

  if (!project) {
    throw new Error('Project not found or access denied')
  }

  // Check project-level permissions
  if (ctx.permissions.projects !== 'all' &&
      !ctx.permissions.projects.includes(input.projectId)) {
    throw new Error('Project access denied by token permissions')
  }

  // Build query conditions
  const conditions = [eq(projectLearningPaths.projectId, input.projectId)]

  if (input.types && input.types.length > 0) {
    conditions.push(inArray(projectLearningPaths.type, input.types))
  }

  const items = await db
    .select()
    .from(projectLearningPaths)
    .where(and(...conditions))
    .limit(1000) // Safety limit

  if (items.length === 0) {
    return {
      items: [],
      tokenCount: 0,
      projectName: project.name
    }
  }

  // Generate query embedding
  const queryEmbedding = await embeddings.embed(input.query)

  // Convert to MemoryCandidate format
  const candidates: MemoryCandidate[] = items.map(item => ({
    id: item.id,
    type: item.type,
    content: item.content,
    context: item.context,
    embedding: item.embedding as number[] | null,
    domains: (item.domains as string[]) || [],
    usageCount: item.usageCount || 0,
    lastUsedAt: item.lastUsedAt,
    createdAt: item.createdAt
  }))

  // Score candidates using the relevance engine
  const scored = relevance.scoreCandidates(candidates, queryEmbedding, {
    complexity: 'moderate',
    intent: 'question',
    domains: [],
    conversationDepth: 0,
    hasCodeContext: false,
    referencesHistory: false
  })

  // Select items within token budget
  const budget = Math.min(input.maxTokens || 2000, 8000)
  const selected = relevance.selectMemory(scored, budget)

  // Calculate approximate token count
  const tokenCount = selected.reduce((acc, item) => {
    return acc + Math.ceil((item.content.length + (item.context?.length || 0)) / 4)
  }, 0)

  return {
    items: selected.map(item => ({
      id: item.id,
      type: item.type as LearningType,
      content: item.content,
      context: input.includeContext !== false ? item.context ?? undefined : undefined,
      relevanceScore: item.score || 0,
      createdAt: item.createdAt?.toISOString() || new Date().toISOString()
    })),
    tokenCount,
    projectName: project.name
  }
}
