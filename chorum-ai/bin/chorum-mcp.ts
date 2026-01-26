#!/usr/bin/env node

/**
 * ChorumAI MCP Server Entry Point
 *
 * This script starts the MCP server in stdio mode for IDE integration.
 * It reads the CHORUM_API_TOKEN environment variable for authentication.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createChorumMcpServer } from '../src/lib/mcp/server'

async function main() {
  // Validate environment
  if (!process.env.CHORUM_API_TOKEN) {
    console.error('Error: CHORUM_API_TOKEN environment variable not set')
    console.error('Generate a token in ChorumAI settings or run `chorum mcp config`')
    process.exit(1)
  }

  const server = createChorumMcpServer()
  const transport = new StdioServerTransport()

  await server.connect(transport)

  // Keep the process running
  process.on('SIGINT', async () => {
    await server.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await server.close()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
})
