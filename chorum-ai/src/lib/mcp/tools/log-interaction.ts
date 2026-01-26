import { db } from '@/lib/db'
import { projects, projectConfidence, mcpInteractionLog } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { LogInteractionInput, LogInteractionOutput, McpContext } from '../types'

// Confidence adjustments based on query type
const CONFIDENCE_ADJUSTMENTS: Record<string, number> = {
  trivial: 0.1,
  moderate: 0.3,
  complex: 0.5,
  critical: 1.0
}

export async function logInteraction(
  input: LogInteractionInput,
  ctx: McpContext
): Promise<LogInteractionOutput> {
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

  // Log the interaction
  await db.insert(mcpInteractionLog).values({
    projectId: input.projectId,
    userId: ctx.userId,
    source: input.source,
    toolName: 'log_interaction',
    queryType: input.queryType
  })

  // Update confidence score
  const adjustment = CONFIDENCE_ADJUSTMENTS[input.queryType] || 0.1

  const [confidence] = await db
    .select()
    .from(projectConfidence)
    .where(eq(projectConfidence.projectId, input.projectId))
    .limit(1)

  let newScore: number

  if (confidence) {
    // Increase confidence (asymptotic approach to 100)
    const currentScore = parseFloat(confidence.score as string)
    newScore = currentScore + (100 - currentScore) * adjustment * 0.01

    await db
      .update(projectConfidence)
      .set({
        score: newScore.toFixed(2),
        interactionCount: sql`${projectConfidence.interactionCount} + 1`,
        positiveInteractionCount: sql`${projectConfidence.positiveInteractionCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(projectConfidence.projectId, input.projectId))
  } else {
    // Create initial confidence record
    newScore = 50 + adjustment * 10
    await db.insert(projectConfidence).values({
      projectId: input.projectId,
      score: newScore.toFixed(2),
      interactionCount: 1,
      positiveInteractionCount: 1
    })
  }

  return {
    success: true,
    newConfidenceScore: Math.round(newScore * 100) / 100
  }
}
