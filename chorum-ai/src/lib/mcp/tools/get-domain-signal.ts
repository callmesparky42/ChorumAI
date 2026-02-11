import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { analyzeProjectDomain, getOrComputeDomainSignal } from '@/lib/chorum/domainSignal'
import type { GetDomainSignalInput, GetDomainSignalOutput, McpContext } from '../types'

export async function getDomainSignal(
  input: GetDomainSignalInput,
  ctx: McpContext
): Promise<GetDomainSignalOutput> {
  // Verify project access
  const [project] = await db
    .select({ id: projects.id })
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

  const signal = input.recompute
    ? await analyzeProjectDomain(input.projectId)
    : await getOrComputeDomainSignal(input.projectId)

  return {
    primary: signal.primary,
    domains: signal.domains,
    conversationsAnalyzed: signal.conversationsAnalyzed,
    computedAt: signal.computedAt.toISOString()
  }
}
