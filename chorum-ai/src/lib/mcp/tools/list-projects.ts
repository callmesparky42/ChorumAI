import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import type { ListProjectsInput, ListProjectsOutput, McpContext } from '../types'

export async function listProjects(
  _input: ListProjectsInput,
  ctx: McpContext
): Promise<ListProjectsOutput> {
  // Build query based on permissions
  let query = db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt
    })
    .from(projects)
    .where(eq(projects.userId, ctx.userId))
    .orderBy(desc(projects.createdAt))
    .limit(100)

  const userProjects = await query

  // Filter by project permissions if not 'all'
  let filteredProjects = userProjects
  if (ctx.permissions.projects !== 'all') {
    filteredProjects = userProjects.filter(p =>
      (ctx.permissions.projects as string[]).includes(p.id)
    )
  }

  return {
    projects: filteredProjects.map(p => ({
      id: p.id,
      name: p.name,
      lastActivity: p.createdAt?.toISOString() || new Date().toISOString()
    }))
  }
}
