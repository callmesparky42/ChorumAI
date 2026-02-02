/**
 * MCP Client Module
 * Provides functionality for connecting to external MCP servers
 * and making their tools available to the chat system
 */

export * from './types'
export { mcpClientManager } from './manager'
export {
  getToolsForUser,
  executeToolCall,
  refreshAllTools,
  getServerConfig
} from './executor'
