import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths, projects } from '@/lib/db/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { getLinksForProject } from '@/lib/learning/links'
import { getCohorts } from '@/lib/learning/cooccurrence'

/**
 * GET /api/learning/graph?projectId=xxx
 * Returns nodes + edges for knowledge graph visualization.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, session.user.id))
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const nodesRaw = await db
      .select({
        id: projectLearningPaths.id,
        type: projectLearningPaths.type,
        content: projectLearningPaths.content,
        domains: projectLearningPaths.domains,
        usageCount: projectLearningPaths.usageCount,
        pinnedAt: projectLearningPaths.pinnedAt,
        mutedAt: projectLearningPaths.mutedAt,
        lastUsedAt: projectLearningPaths.lastUsedAt,
        createdAt: projectLearningPaths.createdAt
      })
      .from(projectLearningPaths)
      .where(and(
        eq(projectLearningPaths.projectId, projectId),
        isNull(projectLearningPaths.mutedAt)
      ))
      .orderBy(desc(projectLearningPaths.usageCount))
      .limit(100)

    const nodeIds = new Set(nodesRaw.map(n => n.id))

    const links = await getLinksForProject(projectId)
    const linkEdges = links.map(link => ({
      id: link.id,
      source: link.fromId,
      target: link.toId,
      edgeType: 'link' as const,
      linkType: link.linkType,
      strength: Number(link.strength || 0.5)
    }))

    const cohorts = await getCohorts(projectId, 3)
    const coEdges = cohorts
      .filter(c => nodeIds.has(c.itemA) && nodeIds.has(c.itemB))
      .map((c, idx) => ({
        id: `co_${idx}_${c.itemA}_${c.itemB}`,
        source: c.itemA,
        target: c.itemB,
        edgeType: 'cooccurrence' as const,
        strength: 0.3,
        count: c.count || 0
      }))

    return NextResponse.json({
      nodes: nodesRaw.map(n => ({
        id: n.id,
        type: n.type,
        content: n.content,
        domains: (n.domains as string[]) || [],
        usageCount: n.usageCount || 0,
        pinnedAt: n.pinnedAt ? n.pinnedAt.toISOString() : null,
        mutedAt: n.mutedAt ? n.mutedAt.toISOString() : null,
        lastUsedAt: n.lastUsedAt ? n.lastUsedAt.toISOString() : null,
        createdAt: n.createdAt ? n.createdAt.toISOString() : null
      })),
      edges: [...linkEdges, ...coEdges]
    })
  } catch (error) {
    console.error('[Learning/graph] GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
