import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customAgents } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { AgentDefinition } from '@/lib/agents/types'

// GET - List all custom agents for the current user
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agents = await db.query.customAgents.findMany({
      where: eq(customAgents.userId, session.user.id),
      orderBy: [desc(customAgents.createdAt)]
    })

    return NextResponse.json({
      agents: agents.map(a => ({
        ...a.config,
        id: a.id
      }))
    })
  } catch (error: unknown) {
    console.error('Failed to list agents:', error instanceof Error ? error.message : error)
    return NextResponse.json({ agents: [] })
  }
}

// POST - Save a custom agent to the database
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agent: AgentDefinition = await request.json()

    const [newAgent] = await db.insert(customAgents).values({
      userId: session.user.id,
      name: agent.name,
      config: agent
    }).returning()

    return NextResponse.json({ success: true, id: newAgent.id })
  } catch (error: unknown) {
    console.error('Failed to save agent:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to save agent' },
      { status: 500 }
    )
  }
}
