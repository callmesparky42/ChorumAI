import { db } from '@/lib/db'
import { projects, projectLearningPaths } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { GetInvariantsInput, GetInvariantsOutput, McpContext } from '../types'

export async function getInvariants(
  input: GetInvariantsInput,
  ctx: McpContext
): Promise<GetInvariantsOutput> {
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

  // Get all invariants for the project
  const invariants = await db
    .select()
    .from(projectLearningPaths)
    .where(
      and(
        eq(projectLearningPaths.projectId, input.projectId),
        eq(projectLearningPaths.type, 'invariant')
      )
    )
    .limit(100) // Safety limit

  return {
    invariants: invariants.map(inv => {
      const metadata = inv.metadata as { checkType?: string; checkValue?: string; severity?: string } | null
      return {
        id: inv.id,
        content: inv.content,
        checkType: (metadata?.checkType as 'keyword' | 'regex' | 'semantic') || 'semantic',
        checkValue: metadata?.checkValue,
        severity: (metadata?.severity as 'warning' | 'error') || 'warning'
      }
    })
  }
}
