import { db } from '@/lib/db'
import { projects, pendingLearnings } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { ProposeLearningInput, ProposeLearningOutput, McpContext } from '../types'

export async function proposeLearning(
  input: ProposeLearningInput,
  ctx: McpContext
): Promise<ProposeLearningOutput> {
  // Check write permission
  if (!ctx.permissions.write) {
    throw new Error('Write permission denied')
  }

  // Check project access
  if (ctx.permissions.projects !== 'all' &&
      !ctx.permissions.projects.includes(input.projectId)) {
    throw new Error('Project access denied')
  }

  // Verify project exists and belongs to user
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

  // Validate type
  const validTypes = ['pattern', 'antipattern', 'decision', 'invariant', 'goldenPath']
  if (!validTypes.includes(input.type)) {
    throw new Error(`Invalid learning type: ${input.type}. Must be one of: ${validTypes.join(', ')}`)
  }

  // Create pending learning
  const [pending] = await db
    .insert(pendingLearnings)
    .values({
      projectId: input.projectId,
      userId: ctx.userId,
      type: input.type,
      content: input.content,
      context: input.context,
      source: input.source,
      status: 'pending'
    })
    .returning({ id: pendingLearnings.id })

  return {
    proposalId: pending.id,
    status: 'pending_approval',
    message: `Proposal queued for review in ChorumAI. The user will be notified to approve or deny this ${input.type}.`
  }
}
