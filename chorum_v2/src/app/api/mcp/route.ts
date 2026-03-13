import { NextResponse } from 'next/server'
import { authenticate, enforceOwnership, hasScope } from '@/lib/customization/auth'
import {
  EndSessionParamsSchema,
  ExtractLearningsParamsSchema,
  GetContextParamsSchema,
  InjectLearningParamsSchema,
  MCPRequestSchema,
  ReadNebulaParamsSchema,
  StartSessionParamsSchema,
  SubmitFeedbackParamsSchema,
  TOOL_SCOPES,
} from '@/lib/customization/types'
import type { MCPResponse } from '@/lib/customization/types'
import {
  handleEndSession,
  handleExtractLearnings,
  handleGetContext,
  handleInjectLearning,
  handleReadNebula,
  handleStartSession,
  handleSubmitFeedback,
} from '@/lib/customization/handlers'
import {
  HealthMcpError,
  handleHealthCheckup,
  handleHealthSnapshot,
  handleHealthSources,
  handleHealthTrends,
} from '@/lib/customization/health-handlers'

const MCP_TOOL_MANIFEST = [
  {
    name: 'start_session',
    description: 'CALL THIS AT THE START OF EVERY CONVERSATION. Registers a new session and loads relevant memory context.',
  },
  {
    name: 'get_context',
    description: 'Retrieves relevant learnings from the memory graph for the current query.',
  },
  {
    name: 'inject_learning',
    description: 'Call whenever the user teaches a preference, correction, decision, rule, or reusable workflow.',
  },
  {
    name: 'submit_feedback',
    description: 'Call when recalled memory is helpful or unhelpful so ranking quality improves over time.',
  },
  {
    name: 'extract_learnings',
    description: 'Call near the end of a conversation to auto-extract learnings from conversation history.',
  },
  {
    name: 'end_session',
    description: 'CALL THIS WHEN THE CONVERSATION ENDS. Closes the session and optionally triggers extraction.',
  },
  {
    name: 'read_nebula',
    description: 'Browse or inspect stored learnings directly when asked what the system remembers.',
  },
  {
    name: 'health_snapshot',
    description: 'Store a point-in-time health data record (Garmin metrics, lab results, ICD report, vital signs).',
  },
  {
    name: 'health_trends',
    description: 'Query recent health data. Returns structured metrics for the last N days. Use this before answering questions about the user\'s health patterns.',
  },
  {
    name: 'health_sources',
    description: 'Search trusted medical knowledge sources (Mayo Clinic, NIH, Cleveland Clinic, etc.) for a health query.',
  },
  {
    name: 'health_checkup',
    description: 'Retrieve a structured summary of the user\'s recent health data (last 7 days). Returns numeric metrics only. Does not analyze or diagnose.',
  },
]

const MCP_SYSTEM_PROMPT = {
  name: 'chorum-memory-system',
  description: 'System instructions for Chorum memory-augmented conversations',
  messages: [
    {
      role: 'system',
      content: {
        type: 'text',
        text: `You are connected to Chorum, a persistent memory system.

Workflow:
1) Call start_session at conversation start.
2) Call inject_learning whenever the user teaches stable preferences, rules, or decisions.
3) Call get_context before answering questions that may rely on prior memory.
4) Call submit_feedback on positive/negative reactions to recalled memory.
5) Call end_session when the conversation concludes, including history when available.`,
      },
    },
  ],
}

function jsonrpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): MCPResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: { code, message, data },
  }
}

function jsonrpcSuccess(id: string | number, result: unknown): MCPResponse {
  return { jsonrpc: '2.0', id, result }
}

const rateLimitCache = new Map<string, { count: number; resetAt: number }>()
const MAX_REQUESTS = 600
const WINDOW_MS = 60 * 1000 // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const record = rateLimitCache.get(userId)
  if (!record || now > record.resetAt) {
    rateLimitCache.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (record.count >= MAX_REQUESTS) {
    return false
  }
  record.count += 1
  return true
}

export async function POST(request: Request) {
  const authCtx = await authenticate(request)
  if (!authCtx) {
    return NextResponse.json(
      jsonrpcError(null, -32000, 'Unauthorized: invalid or missing Bearer token'),
      { status: 401 },
    )
  }

  if (!checkRateLimit(authCtx.userId)) {
    return NextResponse.json(
      jsonrpcError(null, -32005, 'Too Many Requests'),
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(jsonrpcError(null, -32700, 'Parse error: invalid JSON'), { status: 400 })
  }

  const envelope = MCPRequestSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(jsonrpcError(null, -32600, 'Invalid Request', envelope.error.issues), {
      status: 400,
    })
  }

  const { id, method, params } = envelope.data

  if (method === 'tools/list') {
    return NextResponse.json(jsonrpcSuccess(id, { tools: MCP_TOOL_MANIFEST }))
  }
  if (method === 'prompts/list') {
    return NextResponse.json(jsonrpcSuccess(id, { prompts: [MCP_SYSTEM_PROMPT] }))
  }
  if (method === 'resources/list') {
    return NextResponse.json(jsonrpcSuccess(id, {
      resources: [{
        uri: 'chorum://memory-system',
        name: 'Chorum Memory System',
        description: 'Behavioral contract for memory-augmented conversations',
      }],
    }))
  }
  if (method === 'resources/read') {
    return NextResponse.json(jsonrpcSuccess(id, {
      contents: [{
        uri: 'chorum://memory-system',
        text: MCP_SYSTEM_PROMPT.messages[0]?.content.text ?? '',
      }],
    }))
  }

  if (!hasScope(authCtx, method)) {
    return NextResponse.json(
      jsonrpcError(id, -32000, `Forbidden: token lacks scope '${TOOL_SCOPES[method] ?? method}'`),
      { status: 403 },
    )
  }

  try {
    switch (method) {
      case 'start_session': {
        const parsed = StartSessionParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleStartSession(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'read_nebula': {
        const parsed = ReadNebulaParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleReadNebula(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'get_context': {
        const parsed = GetContextParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleGetContext(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'inject_learning': {
        const parsed = InjectLearningParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleInjectLearning(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'submit_feedback': {
        const parsed = SubmitFeedbackParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleSubmitFeedback(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'extract_learnings': {
        const parsed = ExtractLearningsParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleExtractLearnings(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'end_session': {
        const parsed = EndSessionParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues), {
            status: 400,
          })
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleEndSession(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'health_snapshot': {
        const result = await handleHealthSnapshot(params, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'health_trends': {
        const result = await handleHealthTrends(params, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'health_sources': {
        const result = await handleHealthSources(params, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      case 'health_checkup': {
        const result = await handleHealthCheckup(params, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      default:
        return NextResponse.json(jsonrpcError(id, -32601, `Method not found: ${method}`), { status: 404 })
    }
  } catch (err) {
    if (err instanceof HealthMcpError) {
      const status = err.code === -32602 ? 400 : 500
      return NextResponse.json(jsonrpcError(id, err.code, err.message), { status })
    }
    console.error(`[MCP] Error handling ${method}:`, err)
    return NextResponse.json(jsonrpcError(id, -32603, 'Internal error'), { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '2.0.0-alpha.5',
    tools: MCP_TOOL_MANIFEST,
    prompts: [MCP_SYSTEM_PROMPT.name],
  })
}
