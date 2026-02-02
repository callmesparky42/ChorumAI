import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mcpServerConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

// GET - List user's MCP servers
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const servers = await db.select()
    .from(mcpServerConfigs)
    .where(eq(mcpServerConfigs.userId, session.user.id))

  return NextResponse.json({
    servers: servers.map(s => ({
      id: s.id,
      name: s.name,
      transportType: s.transportType,
      command: s.command,
      args: s.args,
      url: s.url,
      isEnabled: s.isEnabled,
      cachedTools: s.cachedTools,
      lastToolRefresh: s.lastToolRefresh
    }))
  })
}

// POST - Add new MCP server
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, transportType, command, args, env, url, headers } = await req.json()

  if (!name || !transportType) {
    return NextResponse.json({ error: 'Name and transport type required' }, { status: 400 })
  }

  if (transportType === 'http' || transportType === 'sse') {
    if (!url) {
      return NextResponse.json({ error: 'URL required for HTTP/SSE transport' }, { status: 400 })
    }
  } else if (transportType === 'stdio') {
    if (!command) {
      return NextResponse.json({ error: 'Command required for stdio transport' }, { status: 400 })
    }
  }

  const [server] = await db.insert(mcpServerConfigs).values({
    userId: session.user.id,
    name,
    transportType,
    command: transportType === 'stdio' ? command : null,
    args: transportType === 'stdio' ? args : null,
    env: transportType === 'stdio' ? env : null,
    url: transportType !== 'stdio' ? url : null,
    headers: transportType !== 'stdio' ? headers : null,
    isEnabled: true
  }).returning()

  return NextResponse.json({ server })
}

// PATCH - Update server (enable/disable, update config)
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, isEnabled, name, cachedTools, lastToolRefresh } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'Server ID required' }, { status: 400 })
  }

  // Verify ownership
  const [existing] = await db.select()
    .from(mcpServerConfigs)
    .where(and(
      eq(mcpServerConfigs.id, id),
      eq(mcpServerConfigs.userId, session.user.id)
    ))

  if (!existing) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  const updates: Partial<typeof mcpServerConfigs.$inferInsert> = {
    updatedAt: new Date()
  }

  if (typeof isEnabled === 'boolean') updates.isEnabled = isEnabled
  if (name) updates.name = name
  if (cachedTools !== undefined) updates.cachedTools = cachedTools
  if (lastToolRefresh) updates.lastToolRefresh = new Date(lastToolRefresh)

  await db.update(mcpServerConfigs)
    .set(updates)
    .where(eq(mcpServerConfigs.id, id))

  return NextResponse.json({ success: true })
}

// DELETE - Remove server
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'Server ID required' }, { status: 400 })
  }

  // Verify ownership and delete
  await db.delete(mcpServerConfigs)
    .where(and(
      eq(mcpServerConfigs.id, id),
      eq(mcpServerConfigs.userId, session.user.id)
    ))

  return NextResponse.json({ success: true })
}
