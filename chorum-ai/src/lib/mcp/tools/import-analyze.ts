import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { parseConversationExport } from '@/lib/portability/parsers'
import { analyzeImportedConversations } from '@/lib/portability/analyzeImport'
import { analyzeProjectDomain } from '@/lib/chorum/domainSignal'
import { getCheapestProvider } from '@/lib/providers/cheapest'
import { storeNormalizedConversations } from '@/lib/portability/store'
import type { ImportAnalyzeInput, ImportAnalyzeOutput, McpContext } from '../types'

function resolveProjectId(input: ImportAnalyzeInput, ctx: McpContext): string {
  if (input.projectId) return input.projectId
  if (ctx.permissions.projects !== 'all' && ctx.permissions.projects.length === 1) {
    return ctx.permissions.projects[0]
  }
  throw new Error('projectId is required when multiple projects are available')
}

export async function importAnalyze(
  input: ImportAnalyzeInput,
  ctx: McpContext
): Promise<ImportAnalyzeOutput> {
  const projectId = resolveProjectId(input, ctx)

  const [project] = await db
    .select({ id: projects.id, focusDomains: projects.focusDomains })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, ctx.userId)
      )
    )
    .limit(1)

  if (!project) {
    throw new Error('Project not found or access denied')
  }

  if (ctx.permissions.projects !== 'all' &&
      !ctx.permissions.projects.includes(projectId)) {
    throw new Error('Project access denied by token permissions')
  }

  const parseResult = parseConversationExport(input.data)
  if (parseResult.format === 'chorum') {
    throw new Error('Detected Chorum native format. Use chorum_import_project instead.')
  }
  if (parseResult.conversations.length === 0) {
    throw new Error('No conversations found in import data')
  }

  if (input.storeConversations) {
    if (!ctx.permissions.write) {
      throw new Error('Write permission required to store conversations')
    }
    await storeNormalizedConversations(projectId, parseResult.conversations)
  }

  const providerConfig = await getCheapestProvider(ctx.userId)
  if (!providerConfig) {
    throw new Error('No active provider configured for analysis')
  }

  const analysisResult = await analyzeImportedConversations(
    parseResult.conversations,
    {
      projectId,
      providerConfig,
      userId: ctx.userId,
      maxConversations: input.maxConversations,
      focusDomains: project.focusDomains ?? []
    }
  )

  if (input.storeConversations) {
    await analyzeProjectDomain(projectId)
  } else {
    await db.update(projects)
      .set({
        domainSignal: {
          primary: analysisResult.domainSignal.primary,
          domains: analysisResult.domainSignal.domains,
          conversationsAnalyzed: analysisResult.domainSignal.conversationsAnalyzed,
          computedAt: analysisResult.domainSignal.computedAt.toISOString()
        }
      })
      .where(eq(projects.id, projectId))
  }

  return {
    success: true,
    format: parseResult.format,
    domainSignal: {
      primary: analysisResult.domainSignal.primary,
      domains: analysisResult.domainSignal.domains,
      conversationsAnalyzed: analysisResult.domainSignal.conversationsAnalyzed,
      computedAt: analysisResult.domainSignal.computedAt.toISOString()
    },
    stats: {
      conversationsProcessed: analysisResult.conversationsProcessed,
      conversationsSkipped: analysisResult.conversationsSkipped,
      learningsStored: analysisResult.learningsStored,
      duplicatesFound: analysisResult.duplicatesFound,
      learningsMerged: analysisResult.learningsMerged,
      errors: analysisResult.errors
    },
    parseWarnings: parseResult.warnings
  }
}
