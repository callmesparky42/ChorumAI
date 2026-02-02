/**
 * MCP Client Types
 * Types for connecting to external MCP servers and executing tools
 */

export interface McpServerConfig {
  id: string
  userId: string
  name: string
  transportType: 'stdio' | 'http' | 'sse'
  command?: string | null
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string | null
  headers?: Record<string, string> | null
  isEnabled: boolean
  cachedTools?: McpToolDefinition[] | null
  lastToolRefresh?: Date | null
}

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpTool extends McpToolDefinition {
  serverId: string
  serverName: string
}

export interface ToolCallRequest {
  name: string
  arguments: Record<string, unknown>
}

export interface ToolCallResult {
  content: ToolResultContent[]
  isError?: boolean
}

export interface ToolResultContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
}

export interface McpClientState {
  isConnected: boolean
  lastError?: string
  tools: McpToolDefinition[]
}
