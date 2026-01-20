import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectLearningPaths, projects } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

interface PatternRequest {
  projectId: string
  patterns: string[]
  source: 'peer-review' | 'agent' | 'manual'
  focus?: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: PatternRequest = await req.json()
    const { projectId, patterns, source, focus } = body

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    if (!patterns || patterns.length === 0) {
      return NextResponse.json({ error: 'No patterns provided' }, { status: 400 })
    }

    // Verify project ownership
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Insert patterns into database
    const insertData = patterns.map(p => ({
      projectId,
      type: 'pattern',
      content: p,
      context: focus ? `Focus: ${focus}` : `Source: ${source}`,
      metadata: { source, focus, timestamp: new Date().toISOString() }
    }))

    await db.insert(projectLearningPaths).values(insertData)

    return NextResponse.json({
      success: true,
      patternsAdded: patterns.length
    })

  } catch (error: unknown) {
    console.error('Pattern write error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: `Failed to save patterns: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve current patterns from database
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
    }

    // Verify project ownership
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, session.user.id)))

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const patterns = await db.query.projectLearningPaths.findMany({
      where: and(
        eq(projectLearningPaths.projectId, projectId),
        eq(projectLearningPaths.type, 'pattern')
      )
    })

    return NextResponse.json({ patterns })
  } catch (error: unknown) {
    console.error('Pattern read error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: `Failed to read patterns: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
