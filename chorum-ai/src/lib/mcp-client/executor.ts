/**
 * MCP Tool Executor
 * High-level functions for integrating MCP tools with the chat system
 */

import { db } from '@/lib/db'
import { mcpServerConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { mcpClientManager } from './manager'
import type { McpTool, McpToolDefinition, ToolCallResult, McpServerConfig } from './types'

/**
 * Get all available MCP tools for a user
 * Aggregates tools from all enabled MCP servers
 */
export async function getToolsForUser(userId: string): Promise<McpTool[]> {
  // Fetch all enabled MCP server configs for the user
  const configs = await db.select()
    .from(mcpServerConfigs)
    .where(
      and(
        eq(mcpServerConfigs.userId, userId),
        eq(mcpServerConfigs.isEnabled, true)
      )
    )

  if (configs.length === 0) {
    return []
  }

  const allTools: McpTool[] = []

  // Aggregate tools from all servers
  for (const config of configs) {
    try {
      // Use cached tools if available and recent (less than 1 hour old)
      const cacheAge = config.lastToolRefresh
        ? Date.now() - new Date(config.lastToolRefresh).getTime()
        : Infinity

      if (config.cachedTools && cacheAge < 60 * 60 * 1000) {
        // Use cached tools
        const tools = (config.cachedTools as McpToolDefinition[]).map(tool => ({
          ...tool,
          serverId: config.id,
          serverName: config.name
        }))
        allTools.push(...tools)
      } else {
        // Refresh tools from server
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
          cachedTools: config.cachedTools as McpToolDefinition[] | null,
          lastToolRefresh: config.lastToolRefresh
        }

        const tools = await mcpClientManager.listTools(serverConfig)
        allTools.push(...tools)

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
          .where(eq(mcpServerConfigs.id, config.id))
      }
    } catch (error) {
      console.error(`[MCP] Failed to get tools from ${config.name}:`, error)
      // Continue with other servers even if one fails
    }
  }

  return allTools
}

/**
 * Execute a tool call
 * Finds the server that owns the tool and executes it
 */
export async function executeToolCall(
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  // Find the server that has this tool
  const configs = await db.select()
    .from(mcpServerConfigs)
    .where(
      and(
        eq(mcpServerConfigs.userId, userId),
        eq(mcpServerConfigs.isEnabled, true)
      )
    )

  let targetConfig: McpServerConfig | null = null

  for (const config of configs) {
    const cachedTools = config.cachedTools as McpToolDefinition[] | null
    if (cachedTools?.some(t => t.name === toolName)) {
      targetConfig = {
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
        cachedTools,
        lastToolRefresh: config.lastToolRefresh
      }
      break
    }
  }

  if (!targetConfig) {
    return {
      content: [{
        type: 'text',
        text: `Tool not found: ${toolName}`
      }],
      isError: true
    }
  }

  return mcpClientManager.callTool(targetConfig, {
    name: toolName,
    arguments: args
  })
}

/**
 * Refresh tools from all servers for a user
 * Used when user wants to manually refresh or after adding a new server
 */
export async function refreshAllTools(userId: string): Promise<McpTool[]> {
  const configs = await db.select()
    .from(mcpServerConfigs)
    .where(
      and(
        eq(mcpServerConfigs.userId, userId),
        eq(mcpServerConfigs.isEnabled, true)
      )
    )

  const allTools: McpTool[] = []

  for (const config of configs) {
    try {
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

      const freshTools = await mcpClientManager.refreshTools(serverConfig)

      // Update cache
      await db.update(mcpServerConfigs)
        .set({
          cachedTools: freshTools,
          lastToolRefresh: new Date(),
          updatedAt: new Date()
        })
        .where(eq(mcpServerConfigs.id, config.id))

      allTools.push(...freshTools.map(t => ({
        ...t,
        serverId: config.id,
        serverName: config.name
      })))
    } catch (error) {
      console.error(`[MCP] Failed to refresh tools from ${config.name}:`, error)
    }
  }

  return allTools
}

/**
 * Get a specific server's config by ID
 */
export async function getServerConfig(userId: string, serverId: string): Promise<McpServerConfig | null> {
  const [config] = await db.select()
    .from(mcpServerConfigs)
    .where(
      and(
        eq(mcpServerConfigs.id, serverId),
        eq(mcpServerConfigs.userId, userId)
      )
    )

  if (!config) return null

  return {
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
    cachedTools: config.cachedTools as McpToolDefinition[] | null,
    lastToolRefresh: config.lastToolRefresh
  }
}
