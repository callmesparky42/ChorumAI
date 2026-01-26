import { db } from '@/lib/db'
import { projects, projectConfidence, projectFileMetadata } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { GetProjectContextInput, GetProjectContextOutput, McpContext } from '../types'

export async function getProjectContext(
  input: GetProjectContextInput,
  ctx: McpContext
): Promise<GetProjectContextOutput> {
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

  // Get confidence score
  const [confidence] = await db
    .select()
    .from(projectConfidence)
    .where(eq(projectConfidence.projectId, input.projectId))
    .limit(1)

  // Get critical files
  const criticalFiles = await db
    .select({ filePath: projectFileMetadata.filePath })
    .from(projectFileMetadata)
    .where(
      and(
        eq(projectFileMetadata.projectId, input.projectId),
        eq(projectFileMetadata.isCritical, true)
      )
    )
    .limit(50)

  return {
    name: project.name,
    description: project.description || '',
    techStack: (project.techStack as string[]) || [],
    customInstructions: project.customInstructions || '',
    confidence: {
      score: confidence ? parseFloat(confidence.score as string) : 100,
      interactionCount: confidence?.interactionCount || 0
    },
    criticalFiles: criticalFiles.map(f => f.filePath)
  }
}
