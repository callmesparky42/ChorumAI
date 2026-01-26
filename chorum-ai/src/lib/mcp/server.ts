import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { validateToken } from './auth'
import { queryMemory } from './tools/query-memory'
import { getInvariants } from './tools/get-invariants'
import { getProjectContext } from './tools/get-project-context'
import { listProjects } from './tools/list-projects'
import { proposeLearning } from './tools/propose-learning'
import { logInteraction } from './tools/log-interaction'
import type { McpContext } from './types'

// Tool definitions for MCP
const TOOLS = [
  {
    name: 'chorum_query_memory',
    description: 'Query project memory with semantic search. Returns patterns, decisions, and invariants relevant to your query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID to query' },
        query: { type: 'string', description: 'Natural language query' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['pattern', 'antipattern', 'decision', 'invariant', 'goldenPath'] },
          description: 'Filter by learning type'
        },
        maxTokens: { type: 'number', description: 'Maximum tokens to return (default: 2000, max: 8000)' },
        includeContext: { type: 'boolean', description: 'Include surrounding context (default: true)' }
      },
      required: ['projectId', 'query']
    }
  },
  {
    name: 'chorum_get_invariants',
    description: 'Get all active invariants (rules that must never be broken) for a project.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'chorum_get_project_context',
    description: 'Get high-level project context including tech stack, custom instructions, and confidence score.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID' }
      },
      required: ['projectId']
    }
  },
  {
    name: 'chorum_list_projects',
    description: 'List all projects the authenticated user has access to.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'chorum_propose_learning',
    description: 'Propose a new pattern, decision, or invariant. Will be queued for user approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        type: { type: 'string', enum: ['pattern', 'antipattern', 'decision', 'invariant', 'goldenPath'] },
        content: { type: 'string', description: 'The learning content' },
        context: { type: 'string', description: 'Why this was learned (optional)' },
        source: { type: 'string', description: 'Source identifier (e.g., "claude-code")' }
      },
      required: ['projectId', 'type', 'content', 'source']
    }
  },
  {
    name: 'chorum_log_interaction',
    description: 'Log an interaction for confidence scoring. Helps ChorumAI understand project engagement.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        source: { type: 'string', description: 'Source identifier (e.g., "claude-code")' },
        queryType: { type: 'string', enum: ['trivial', 'moderate', 'complex', 'critical'] }
      },
      required: ['projectId', 'source', 'queryType']
    }
  }
]

export function createChorumMcpServer() {
  const server = new Server(
    {
      name: 'chorum-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS }
  })

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    // Validate auth on every call
    const token = process.env.CHORUM_API_TOKEN
    if (!token) {
      return {
        content: [{ type: 'text', text: 'Error: CHORUM_API_TOKEN environment variable not set' }],
        isError: true
      }
    }

    const auth = await validateToken(token)
    if (!auth.valid) {
      return {
        content: [{ type: 'text', text: `Error: ${auth.error}` }],
        isError: true
      }
    }

    const authContext: McpContext = {
      userId: auth.userId!,
      permissions: auth.permissions!
    }

    try {
      let result: unknown

      // Type assertions for MCP tool arguments
      const toolArgs = args as Record<string, unknown>

      switch (name) {
        case 'chorum_query_memory':
          result = await queryMemory(toolArgs as unknown as Parameters<typeof queryMemory>[0], authContext)
          break
        case 'chorum_get_invariants':
          result = await getInvariants(toolArgs as unknown as Parameters<typeof getInvariants>[0], authContext)
          break
        case 'chorum_get_project_context':
          result = await getProjectContext(toolArgs as unknown as Parameters<typeof getProjectContext>[0], authContext)
          break
        case 'chorum_list_projects':
          result = await listProjects(toolArgs as unknown as Parameters<typeof listProjects>[0], authContext)
          break
        case 'chorum_propose_learning':
          result = await proposeLearning(toolArgs as unknown as Parameters<typeof proposeLearning>[0], authContext)
          break
        case 'chorum_log_interaction':
          result = await logInteraction(toolArgs as unknown as Parameters<typeof logInteraction>[0], authContext)
          break
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true
          }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true
      }
    }
  })

  return server
}
