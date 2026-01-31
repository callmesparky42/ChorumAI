import { NextRequest, NextResponse } from 'next/server'
import { createChorumMcpServer } from '@/lib/mcp/server'

/**
 * MCP HTTP Endpoint for ChorumAI
 * 
 * Handles MCP protocol over HTTP for IDE integrations.
 * Clients configure with:
 * {
 *   "chorum": {
 *     "url": "https://chorum.ai/api/mcp",
 *     "headers": { "Authorization": "Bearer chorum_xxxxx" }
 *   }
 * }
 */

export async function POST(request: NextRequest) {
    // Extract bearer token from Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Missing or invalid Authorization header' },
                id: null
            },
            { status: 401 }
        )
    }

    const token = authHeader.slice(7) // Remove "Bearer "

    // Set token in process.env for MCP server to validate
    // (The MCP server reads from CHORUM_API_TOKEN)
    process.env.CHORUM_API_TOKEN = token

    try {
        const body = await request.json()

        // Validate JSON-RPC structure
        if (!body.jsonrpc || body.jsonrpc !== '2.0') {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    error: { code: -32600, message: 'Invalid Request: missing jsonrpc field' },
                    id: body.id || null
                },
                { status: 400 }
            )
        }

        // Create a fresh server instance for each request (stateless)
        const server = createChorumMcpServer()

        // Handle the MCP request directly without transport layer
        // This is a simplified approach for Next.js compatibility
        const result = await handleMcpRequest(server, body)

        return NextResponse.json(result, {
            headers: {
                'Content-Type': 'application/json',
            }
        })
    } catch (error) {
        console.error('MCP request error:', error)
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Internal error'
                },
                id: null
            },
            { status: 500 }
        )
    } finally {
        // Clean up
        delete process.env.CHORUM_API_TOKEN
    }
}

export async function GET() {
    // MCP spec: GET not supported for streamable HTTP
    return NextResponse.json(
        {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed. Use POST for MCP requests.' },
            id: null
        },
        { status: 405 }
    )
}

export async function DELETE() {
    return NextResponse.json(
        {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null
        },
        { status: 405 }
    )
}

/**
 * Handle MCP JSON-RPC requests directly
 * Instead of using the full transport machinery, we handle tools inline
 */
async function handleMcpRequest(server: ReturnType<typeof createChorumMcpServer>, request: {
    jsonrpc: string
    method: string
    params?: Record<string, unknown>
    id?: string | number | null
}) {
    const { method, params, id } = request

    try {
        // Handle standard MCP methods
        switch (method) {
            case 'initialize':
                return {
                    jsonrpc: '2.0',
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: 'chorum-mcp',
                            version: '1.0.0'
                        }
                    },
                    id
                }

            case 'tools/list':
                // Use the server's internal tool list
                const tools = await getServerTools()
                return {
                    jsonrpc: '2.0',
                    result: { tools },
                    id
                }

            case 'tools/call': {
                // Import the tool handlers directly
                const { validateToken } = await import('@/lib/mcp/auth')
                const auth = await validateToken(process.env.CHORUM_API_TOKEN || '')

                if (!auth.valid) {
                    return {
                        jsonrpc: '2.0',
                        error: { code: -32001, message: auth.error || 'Authentication failed' },
                        id
                    }
                }

                const toolParams = params as { name: string; arguments?: Record<string, unknown> }
                const toolResult = await executeToolCall(toolParams.name, toolParams.arguments || {}, {
                    userId: auth.userId!,
                    permissions: auth.permissions!
                })

                return {
                    jsonrpc: '2.0',
                    result: toolResult,
                    id
                }
            }

            case 'ping':
                return { jsonrpc: '2.0', result: {}, id }

            case 'notifications/initialized':
                // Client notification, no response needed
                return null

            default:
                return {
                    jsonrpc: '2.0',
                    error: { code: -32601, message: `Method not found: ${method}` },
                    id
                }
        }
    } catch (error) {
        return {
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: error instanceof Error ? error.message : 'Internal error'
            },
            id
        }
    }
}

/**
 * Get the list of tools the server provides
 */
async function getServerTools() {
    return [
        {
            name: 'chorum_query_memory',
            description: 'Query project memory with semantic search. Returns patterns, decisions, and invariants relevant to your query.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'The project ID to query' },
                    query: { type: 'string', description: 'Natural language query' },
                    types: {
                        type: 'array',
                        items: { type: 'string', enum: ['pattern', 'antipattern', 'decision', 'invariant', 'goldenPath'] },
                        description: 'Filter by learning type'
                    },
                    maxTokens: { type: 'number', description: 'Maximum tokens to return (default: 2000, max: 8000)' }
                },
                required: ['projectId', 'query']
            }
        },
        {
            name: 'chorum_get_invariants',
            description: 'Get all active invariants (rules that must never be broken) for a project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'The project ID' }
                },
                required: ['projectId']
            }
        },
        {
            name: 'chorum_get_project_context',
            description: 'Get high-level project context including tech stack and custom instructions.',
            inputSchema: {
                type: 'object',
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
                type: 'object',
                properties: {}
            }
        },
        {
            name: 'chorum_propose_learning',
            description: 'Propose a new pattern, decision, or invariant. Will be queued for user approval.',
            inputSchema: {
                type: 'object',
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
            description: 'Log an interaction for confidence scoring.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'The project ID' },
                    source: { type: 'string', description: 'Source identifier (e.g., "claude-code")' },
                    queryType: { type: 'string', enum: ['trivial', 'moderate', 'complex', 'critical'] }
                },
                required: ['projectId', 'source', 'queryType']
            }
        }
    ]
}

/**
 * Execute a tool call
 */
async function executeToolCall(
    name: string,
    args: Record<string, unknown>,
    context: { userId: string; permissions: unknown }
) {
    const { queryMemory } = await import('@/lib/mcp/tools/query-memory')
    const { getInvariants } = await import('@/lib/mcp/tools/get-invariants')
    const { getProjectContext } = await import('@/lib/mcp/tools/get-project-context')
    const { listProjects } = await import('@/lib/mcp/tools/list-projects')
    const { proposeLearning } = await import('@/lib/mcp/tools/propose-learning')
    const { logInteraction } = await import('@/lib/mcp/tools/log-interaction')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mcpContext: any = {
        userId: context.userId,
        permissions: context.permissions
    }

    try {
        let result: unknown

        switch (name) {
            case 'chorum_query_memory':
                result = await queryMemory(args as never, mcpContext)
                break
            case 'chorum_get_invariants':
                result = await getInvariants(args as never, mcpContext)
                break
            case 'chorum_get_project_context':
                result = await getProjectContext(args as never, mcpContext)
                break
            case 'chorum_list_projects':
                result = await listProjects({}, mcpContext)
                break
            case 'chorum_propose_learning':
                result = await proposeLearning(args as never, mcpContext)
                break
            case 'chorum_log_interaction':
                result = await logInteraction(args as never, mcpContext)
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
}

