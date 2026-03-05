# Skill: MCP Contract Agent

> **Trigger:** Any work on the `chorumd` daemon, MCP tools, or external client connectivity
> **Purpose:** Enforce that MCP is the primary client interface, not an afterthought
> **Best Model:** Sonnet 4.6 (contract compliance checking, precise output) | **Codex** (code generation partner — run this skill to validate Codex-generated MCP route handlers)

---

## The One Question This Skill Answers

> *Does this implementation treat MCP as the core interface contract, enabling any client to connect?*

---

## What MCP Means for Chorum

MCP (Model Context Protocol) is how external tools connect to Chorum's cognitive backend.

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Clients                             │
├─────────────┬─────────────┬─────────────┬─────────────────┤
│   Cursor    │ Claude Code │   VS Code   │  Chorum UI      │
│    IDE      │    CLI      │  Continue   │  (also a client)│
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬────────┘
       │             │             │               │
       └─────────────┴─────────────┴───────────────┘
                           │
                    ┌──────▼──────┐
                    │  MCP Server │
                    │  /api/mcp   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Binary Star │
                    │   (Core)    │
                    └─────────────┘
```

**Key Insight:** The Chorum web UI is just another MCP client. The MCP interface IS the product interface.

---

## Core MCP Tools

These four tools MUST always be present:

### 1. `read_nebula`

Query the knowledge graph for relevant context.

```typescript
interface ReadNebulaInput {
  query: string;                    // Natural language query
  scopes?: string[];                // Filter by scope tags
  limit?: number;                   // Max results (default: 10)
  minConfidence?: number;           // Confidence threshold (default: 0.3)
  includeEmbedding?: boolean;       // Return embeddings (default: false)
}

interface ReadNebulaOutput {
  learnings: {
    id: string;
    content: string;
    type: string;
    confidence: number;
    scopes: string[];
    relevanceScore: number;
  }[];
  totalMatches: number;
  queryEmbedding?: number[];        // If requested
}
```

**Auth:** Read-only, no approval required.

### 2. `get_context`

Get compiled context ready for injection (uses Podium internally).

```typescript
interface GetContextInput {
  query: string;                    // The user's current query
  conversationId?: string;          // For tracking
  scopes?: string[];                // Scope filter
  domain?: string;                  // Force domain (else auto-detect)
  maxTokens?: number;               // Budget override
  tier?: 1 | 2 | 3;                 // Force tier (else auto-select)
}

interface GetContextOutput {
  compiledContext: string;          // Ready to inject into prompt
  tierUsed: 1 | 2 | 3;
  tokensUsed: number;
  itemCount: number;
  learningIds: string[];            // For feedback tracking
  auditSummary: string;             // Human-readable injection summary
}
```

**Auth:** Read-only, no approval required.

### 3. `inject_learning`

Add a new learning to the knowledge graph.

```typescript
interface InjectLearningInput {
  content: string;                  // The learning content
  type: string;                     // Learning type
  scopes: string[];                 // Scope tags
  source?: string;                  // 'manual' | 'import' | 'extraction'
  confidence?: number;              // Initial confidence (default: 0.5)
  conversationId?: string;          // Origin conversation
}

interface InjectLearningOutput {
  id: string;                       // Created learning ID
  status: 'created' | 'queued';     // Immediate or pending approval
  message: string;
}
```

**Auth:** Write operation — queued for human approval by default.

### 4. `submit_feedback`

Record an outcome signal for the Conductor.

```typescript
interface SubmitFeedbackInput {
  learningId: string;               // Which learning
  signal: 'positive' | 'negative';  // The feedback
  conversationId?: string;          // Context
  injectionId?: string;             // Link to specific injection
  reason?: string;                  // Optional explanation
}

interface SubmitFeedbackOutput {
  received: boolean;
  adjustmentApplied: boolean;       // Was confidence adjusted?
  newConfidence?: number;           // If adjusted
}
```

**Auth:** Write operation — applied immediately for explicit feedback.

---

## Additional MCP Tools (Optional)

These are recommended but not required:

### `list_scopes`
```typescript
// Return all scope tags in user's nebula
interface ListScopesOutput {
  scopes: { name: string; count: number }[];
}
```

### `get_learning`
```typescript
// Get a specific learning by ID
interface GetLearningInput { id: string; }
interface GetLearningOutput { learning: Learning | null; }
```

### `search_learnings`
```typescript
// Full-text search (not semantic)
interface SearchLearningsInput { 
  text: string; 
  scopes?: string[];
}
```

### `get_stats`
```typescript
// Dashboard stats
interface GetStatsOutput {
  totalLearnings: number;
  byType: Record<string, number>;
  byScope: Record<string, number>;
  recentActivity: { date: string; count: number }[];
}
```

---

## Authentication Contract

### Token-Based Auth

```typescript
// Tokens stored in ~/.chorum/config.json (local)
// Or in secure environment variable (hosted)
interface AuthConfig {
  tokens: {
    id: string;
    name: string;
    hashedToken: string;
    createdAt: string;
    lastUsedAt: string | null;
    scopes: string[];         // Which MCP tools this token can access
  }[];
}
```

### Auth Header Format

```
Authorization: Bearer <token>
```

### Token Scopes

```typescript
type TokenScope = 
  | 'read:nebula'      // read_nebula, get_context, get_learning, search_learnings
  | 'write:nebula'     // inject_learning
  | 'write:feedback'   // submit_feedback
  | 'admin'            // All operations
  ;
```

---

## Security Requirements

### 1. JWT Verification

```typescript
// EVERY edge function must verify JWT
// verify_jwt: true is the default — only disable with documented reason

export const config = {
  // ❌ NEVER do this without justification
  // verify_jwt: false,
};
```

### 2. Token Storage

```typescript
// ✅ RIGHT: Token in config file or env var
const token = process.env.CHORUM_API_TOKEN;

// ❌ WRONG: Token in MCP response
// NEVER embed tokens in tool outputs
```

### 3. Rate Limiting

```typescript
// Per-token rate limits
const RATE_LIMITS = {
  'read:nebula': { requests: 100, windowMs: 60_000 },    // 100/min
  'write:nebula': { requests: 20, windowMs: 60_000 },    // 20/min
  'write:feedback': { requests: 50, windowMs: 60_000 },  // 50/min
};
```

### 4. Input Validation

```typescript
// All inputs validated before processing
function validateInjectLearningInput(input: unknown): InjectLearningInput {
  const schema = z.object({
    content: z.string().min(1).max(10_000),
    type: z.string().min(1).max(50),
    scopes: z.array(z.string().regex(/^#?[\w-]+$/)).min(1).max(20),
    source: z.enum(['manual', 'import', 'extraction']).optional(),
    confidence: z.number().min(0).max(1).optional(),
    conversationId: z.string().uuid().optional(),
  });
  return schema.parse(input);
}
```

---

## MCP Server Configuration

### Endpoint

```
POST /api/mcp
```

### Request Format

```typescript
interface MCPRequest {
  tool: string;           // Tool name
  input: unknown;         // Tool-specific input
  requestId?: string;     // For tracking
}
```

### Response Format

```typescript
interface MCPResponse {
  success: boolean;
  result?: unknown;       // Tool-specific output
  error?: {
    code: string;
    message: string;
  };
  requestId?: string;
}
```

### IDE Configuration Block

```json
{
  "mcpServers": {
    "chorum": {
      "url": "https://www.chorumai.com/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

---

## Human-in-the-Loop Rules

### Read Operations (No Approval)
- `read_nebula` — always allowed
- `get_context` — always allowed
- `list_scopes` — always allowed
- `get_learning` — always allowed
- `search_learnings` — always allowed
- `get_stats` — always allowed

### Write Operations (Approval Required by Default)

```typescript
// inject_learning: Queue for approval
async function handleInjectLearning(input: InjectLearningInput): Promise<InjectLearningOutput> {
  // Validate
  const validated = validateInjectLearningInput(input);
  
  // Queue, don't apply directly
  const queued = await db.insert(learningQueue).values({
    ...validated,
    status: 'pending_approval',
    createdAt: new Date(),
  });
  
  return {
    id: queued.id,
    status: 'queued',
    message: 'Learning queued for approval. Check your Chorum inbox.',
  };
}
```

### Exception: Explicit Feedback

```typescript
// submit_feedback with explicit signal: Apply immediately
async function handleSubmitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackOutput> {
  // Explicit feedback is trusted — apply immediately
  const adjustment = calculateAdjustment(input.signal);
  await applyConfidenceAdjustment(input.learningId, adjustment);
  
  return {
    received: true,
    adjustmentApplied: true,
    newConfidence: await getConfidence(input.learningId),
  };
}
```

---

## Client Testing Matrix

Before shipping MCP changes, test with:

| Client | Config Location | Test Command |
|--------|-----------------|--------------|
| Claude Desktop | `claude_desktop_config.json` | Open Claude Desktop, verify tool appears |
| Cursor | `settings.json` → `mcpServers` | Run `@chorum read_nebula test` |
| Windsurf | `settings.json` → `mcpServers` | Verify tools in sidebar |
| VS Code + Continue | `.continue/config.json` | Run tool from Continue panel |
| Gemini Code Assist | Antigravity settings | Test in Antigravity console |
| CLI (curl) | N/A | `curl -X POST -H "Authorization: Bearer $TOKEN" ...` |

---

## Compliance Checklist

Run this checklist against every MCP implementation:

### 1. Core Tools Check
```
□ Is read_nebula implemented?
□ Is get_context implemented?
□ Is inject_learning implemented?
□ Is submit_feedback implemented?
```

### 2. Auth Check
```
□ Is Authorization header required?
□ Is JWT verified on all endpoints?
□ Are tokens NEVER embedded in responses?
□ Are token scopes enforced?
```

### 3. Human-in-the-Loop Check
```
□ Are read operations approval-free?
□ Is inject_learning queued by default?
□ Is explicit feedback applied immediately?
□ Is implicit feedback queued for review?
```

### 4. Security Check
```
□ Is input validation present for all tools?
□ Is rate limiting applied per-token?
□ Are error messages generic (no internal details)?
```

### 5. Client Compatibility Check
```
□ Does config block work in Claude Desktop?
□ Does config block work in Cursor?
□ Is endpoint URL correct (/api/mcp)?
```

---

## Output Format

When reviewing MCP code, return:

```markdown
## MCP Contract Agent Verdict

**File:** `src/app/api/mcp/route.ts`

### Core Tools Check
| Tool | Implemented | Verdict |
|------|-------------|---------|
| read_nebula | ✅ | PASS |
| get_context | ✅ | PASS |
| inject_learning | ✅ | PASS |
| submit_feedback | ❌ | FAIL |

### Auth Check
| Requirement | Present | Verdict |
|-------------|---------|---------|
| Auth header required | ✅ | PASS |
| JWT verification | ✅ | PASS |
| Token not in response | ✅ | PASS |

### Human-in-the-Loop Check
| Operation | Behavior | Verdict |
|-----------|----------|---------|
| inject_learning | Queued | ✅ PASS |
| explicit feedback | Applied | ✅ PASS |

### Overall: ❌ FAIL

**Violations:**
1. submit_feedback tool not implemented

**Recommended Fix:**
Implement submit_feedback handler per interface contract.
```

---

## v1 Learnings This Skill Preserves

| v1 Achievement | What Worked | Guardian Enforcement |
|----------------|-------------|----------------------|
| MCP route exists | Basic structure is sound | Elevate to core, don't rebuild |
| Token auth works | Bearer token pattern | Preserve and extend |
| IDE config documented | Users can connect | Maintain compatibility |

| v1 Gap | What Was Missing | Guardian Enforcement |
|--------|------------------|----------------------|
| MCP as afterthought | UI was primary, MCP secondary | MCP is THE interface |
| Incomplete tools | Only read_nebula existed | All 4 core tools required |
| No feedback via MCP | Had to use UI | submit_feedback required |

---

## Success Criteria

An MCP implementation passes when:
- All 4 core tools implemented and tested
- Auth required on all endpoints
- Human-in-the-loop respected (writes queued, reads free)
- All major IDE clients can connect
- Input validation on all tools
- Rate limiting per token
- No tokens leaked in responses

---

## Codex Partner Notes

This skill validates Codex-generated MCP route handlers and daemon configuration. Run before merging any `src/app/api/mcp/` changes.

**Common Codex patterns to watch for:**
- Codex may apply `inject_learning` immediately instead of queueing — must return `status: 'queued'` by default
- Codex may generate `verify_jwt: false` on edge function config for "simplicity" — forbidden without documented justification
- Codex may expose the raw Bearer token in tool output (e.g., for debugging) — tokens must never appear in MCP responses
- Codex may implement `submit_feedback` as a proposal queue (treating it like `inject_learning`) — explicit feedback must apply immediately per the contract
- Codex may generate a monolithic `/api/mcp` route without the `ChorumClient` adapter pattern — verify the `LocalChorumClient` / `MCPChorumClient` split is preserved so co-located Shell calls don't serialize unnecessarily
