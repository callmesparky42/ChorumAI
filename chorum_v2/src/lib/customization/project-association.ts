import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'

export interface ProjectMatch {
  id: string
  name: string
  scopeFilter: { include: string[]; exclude: string[]; boost: string[] }
  overlapScore: number
}

export async function findProjectByScopes(
  scopes: string[],
  userId: string,
): Promise<ProjectMatch | null> {
  if (scopes.length === 0) return null

  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))

  let bestMatch: ProjectMatch | null = null
  let bestScore = 0

  for (const project of userProjects) {
    const filter = project.scopeFilter as { include?: string[]; exclude?: string[]; boost?: string[] }
    const includeScopes = filter.include ?? []
    const overlap = scopes.filter((s) => includeScopes.includes(s)).length

    if (overlap > bestScore) {
      bestScore = overlap
      bestMatch = {
        id: project.id,
        name: project.name,
        scopeFilter: {
          include: includeScopes,
          exclude: filter.exclude ?? [],
          boost: filter.boost ?? [],
        },
        overlapScore: overlap / Math.max(includeScopes.length, 1),
      }
    }
  }

  return bestScore >= 1 ? bestMatch : null
}
