/**
 * MCP Client Manager
 * Manages connections to external MCP servers and provides tool execution
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type {
  McpServerConfig,
  McpToolDefinition,
  McpTool,
  ToolCallRequest,
  ToolCallResult,
  McpClientState
} from './types'

// Connection timeout in ms
const CONNECTION_TIMEOUT = 30000
// Tool execution timeout in ms
const TOOL_TIMEOUT = 60000
// Idle timeout before disconnecting (5 minutes)
const IDLE_TIMEOUT = 5 * 60 * 1000

interface ClientEntry {
  client: Client
  transport: StdioClientTransport | SSEClientTransport
  config: McpServerConfig
  lastUsed: number
  state: McpClientState
}

/**
 * Singleton manager for MCP client connections
 * Handles connection pooling, tool discovery, and execution
 */
class McpClientManager {
  private clients: Map<string, ClientEntry> = new Map()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Start cleanup interval for idle connections
    this.startCleanupInterval()
  }

  private startCleanupInterval() {
    if (typeof window === 'undefined' && !this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupIdleConnections()
      }, 60000) // Check every minute
    }
  }

  private async cleanupIdleConnections() {
    const now = Date.now()
    for (const [serverId, entry] of this.clients.entries()) {
      if (now - entry.lastUsed > IDLE_TIMEOUT) {
        console.log(`[MCP] Disconnecting idle server: ${entry.config.name}`)
        await this.disconnect(serverId)
      }
    }
  }

  /**
   * Get or create a client connection to an MCP server
   */
  async getClient(config: McpServerConfig): Promise<Client> {
    const existing = this.clients.get(config.id)
    if (existing && existing.state.isConnected) {
      existing.lastUsed = Date.now()
      return existing.client
    }

    return this.connect(config)
  }

  /**
   * Connect to an MCP server
   */
  async connect(config: McpServerConfig): Promise<Client> {
    // Disconnect existing connection if any
    if (this.clients.has(config.id)) {
      await this.disconnect(config.id)
    }

    console.log(`[MCP] Connecting to server: ${config.name} (${config.transportType})`)

    const client = new Client(
      { name: 'chorum-client', version: '1.0.0' },
      { capabilities: {} }
    )

    let transport: StdioClientTransport | SSEClientTransport

    if (config.transportType === 'stdio') {
      if (!config.command) {
        throw new Error(`MCP server ${config.name} is stdio but has no command`)
      }

      // Filter out undefined values from process.env
      const envVars: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value
        }
      }

      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...envVars, ...(config.env || {}) }
      })
    } else if (config.transportType === 'sse' || config.transportType === 'http') {
      if (!config.url) {
        throw new Error(`MCP server ${config.name} is ${config.transportType} but has no URL`)
      }

      transport = new SSEClientTransport(
        new URL(config.url),
        {
          requestInit: {
            headers: config.headers || {}
          }
        }
      )
    } else {
      throw new Error(`Unsupported transport type: ${config.transportType}`)
    }

    // Connect with timeout
    const connectPromise = client.connect(transport)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
    })

    try {
      await Promise.race([connectPromise, timeoutPromise])
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${config.name}:`, error)
      throw error
    }

    // Discover tools
    const tools = await this.discoverTools(client)

    const entry: ClientEntry = {
      client,
      transport,
      config,
      lastUsed: Date.now(),
      state: {
        isConnected: true,
        tools
      }
    }

    this.clients.set(config.id, entry)
    console.log(`[MCP] Connected to ${config.name}, discovered ${tools.length} tools`)

    return client
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const entry = this.clients.get(serverId)
    if (!entry) return

    try {
      await entry.client.close()
    } catch (error) {
      console.error(`[MCP] Error disconnecting from ${entry.config.name}:`, error)
    }

    this.clients.delete(serverId)
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map(id => this.disconnect(id))
    await Promise.all(disconnectPromises)
  }

  /**
   * Discover tools from a connected client
   */
  private async discoverTools(client: Client): Promise<McpToolDefinition[]> {
    try {
      const result = await client.listTools()
      return result.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>
      }))
    } catch (error) {
      console.error('[MCP] Failed to discover tools:', error)
      return []
    }
  }

  /**
   * List tools from a specific server (uses cached connection)
   */
  async listTools(config: McpServerConfig): Promise<McpTool[]> {
    const client = await this.getClient(config)
    const entry = this.clients.get(config.id)

    if (!entry) {
      throw new Error('Client not found after connection')
    }

    return entry.state.tools.map(tool => ({
      ...tool,
      serverId: config.id,
      serverName: config.name
    }))
  }

  /**
   * Refresh tools from a server
   */
  async refreshTools(config: McpServerConfig): Promise<McpToolDefinition[]> {
    const client = await this.getClient(config)
    const tools = await this.discoverTools(client)

    const entry = this.clients.get(config.id)
    if (entry) {
      entry.state.tools = tools
      entry.lastUsed = Date.now()
    }

    return tools
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(config: McpServerConfig, request: ToolCallRequest): Promise<ToolCallResult> {
    const client = await this.getClient(config)
    const entry = this.clients.get(config.id)

    if (entry) {
      entry.lastUsed = Date.now()
    }

    console.log(`[MCP] Calling tool ${request.name} on ${config.name}`)

    // Execute with timeout
    const callPromise = client.callTool({
      name: request.name,
      arguments: request.arguments
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Tool execution timeout: ${request.name}`)), TOOL_TIMEOUT)
    })

    try {
      const result = await Promise.race([callPromise, timeoutPromise])

      // Handle the MCP SDK result which can have various content types
      const resultContent = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }> | undefined
      const isError = 'isError' in result ? Boolean(result.isError) : false

      return {
        content: (resultContent || []).map(item => ({
          type: item.type as 'text' | 'image' | 'resource',
          text: item.text,
          data: item.data,
          mimeType: item.mimeType
        })),
        isError
      }
    } catch (error) {
      console.error(`[MCP] Tool call failed:`, error)
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${request.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      }
    }
  }

  /**
   * Get connection state for a server
   */
  getState(serverId: string): McpClientState | null {
    const entry = this.clients.get(serverId)
    return entry?.state || null
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    const entry = this.clients.get(serverId)
    return entry?.state.isConnected || false
  }
}

// Singleton instance
export const mcpClientManager = new McpClientManager()
