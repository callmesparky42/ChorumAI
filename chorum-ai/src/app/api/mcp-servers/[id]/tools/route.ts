import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { mcpServerConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { mcpClientManager, type McpServerConfig } from '@/lib/mcp-client'

// POST - Refresh tools from server
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch server config
  const [config] = await db.select()
    .from(mcpServerConfigs)
    .where(and(
      eq(mcpServerConfigs.id, id),
      eq(mcpServerConfigs.userId, session.user.id)
    ))

  if (!config) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  }

  try {
    // Convert to McpServerConfig type
    const serverConfig: McpServerConfig = {
      id: config.id,
      userId: config.userId,
      name: config.name,
      transportType: config.transportType as 'stdio' | 'http' | 'sse',
      command: config.command,
      args: config.args as string[] | null,
      env: config.env as Record<string, string> | null,
      url: config.url,
      headers: config.headers as Record<string, string> | null,
      isEnabled: config.isEnabled ?? true,
      cachedTools: null,
      lastToolRefresh: null
    }

    // Refresh tools from the MCP server
    const tools = await mcpClientManager.refreshTools(serverConfig)

    // Update cache in database
    await db.update(mcpServerConfigs)
      .set({
        cachedTools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        })),
        lastToolRefresh: new Date(),
        updatedAt: new Date()
      })
      .where(eq(mcpServerConfigs.id, id))

    return NextResponse.json({
      success: true,
      tools: tools.map(t => ({ name: t.name, description: t.description }))
    })
  } catch (error) {
    console.error(`[MCP] Failed to refresh tools from ${config.name}:`, error)
    return NextResponse.json({
      error: `Failed to connect to MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 })
  }
}
