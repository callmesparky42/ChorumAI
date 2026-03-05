# Phase 3 Specification: Customization Layer (Layer 2) — MCP Surface + Domain Config

**Version:** 1.0
**Date:** 2026-02-27
**Status:** Ready for execution
**Assigned to:** Codex (all Phase 3 files)
**Guardian gates:** `mcp-contract-agent`, `chorum-layer-guardian`
**Prerequisite:** Phase 2 complete — BinaryStarInterface implemented; Podium + Conductor passing all guardian checks; `podium-injection-agent` and `conductor-spec-agent` passing

---

## Agent Instructions

You are executing **Phase 3** of the Chorum 2.0 build. This phase implements the Customization Layer — Layer 2 — which sits directly above Binary Star Core. It exposes the knowledge graph to external clients via MCP, provides domain seed management, and adds per-user decay/confidence configuration.

Read this document completely before writing a single file. Every decision is locked.

**What you will produce:**
1. `drizzle/0003_customization.sql` — migration adding `customization` JSONB column to `user_settings`
2. `src/db/schema.ts` amendment — add `customization` column to `userSettings` table
3. `src/lib/customization/types.ts` — all Phase 3 request/response types + Zod schemas
4. `src/lib/customization/auth.ts` — Bearer token extraction, bcrypt verify, scope enforcement
5. `src/lib/customization/handlers.ts` — 4 MCP tool handler functions (shared logic)
6. `src/lib/customization/client.ts` — ChorumClient interface + LocalChorumClient + MCPChorumClient
7. `src/lib/customization/domain-seeds.ts` — Domain seed CRUD + cluster viewer
8. `src/lib/customization/config.ts` — Per-user decay/confidence overrides
9. `src/lib/customization/index.ts` — Public exports
10. `src/app/api/mcp/route.ts` — MCP HTTP endpoint (replaces 501 stub)
11. `src/__tests__/customization/` — Test files for auth, handlers, client parity

**What you will NOT produce:**
- Any UI components (Phase 5)
- Any agent/persona logic (Phase 4)
- Any embedding computation — embeddings are passed in by callers
- Any `any` types or `@ts-ignore` comments
- Any modifications to Layer 0 or Layer 1 files (Nebula/Core)

**Layer 2 import rule:** `src/lib/customization/` may import from `@/lib/nebula` and `@/lib/core` (via their public interfaces only) and third-party packages. No imports from `@/lib/agents`, `@/lib/providers`, or `@/app`. No reaching into internal Podium/Conductor files — use `BinaryStarInterface` and `NebulaInterface` only.

---

## Reference Documents

| Document | Location | Governs |
|----------|----------|---------|
| Phase Architecture | `CHORUM_V2_PHASE_ARCHITECTURE.md` | ChorumClient adapter, MCP tools, auth flow |
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | Layer 2 import rules, interface boundaries |
| Domain Seeds Spec | `docs/specs/DOMAIN_SEEDS_SPEC.md` | Seed schema, cluster recomputation |
| Checklist | `CHECKLIST_2.0.md` | Phase 3 → Phase 4 transition gates |
| Phase 2 Spec | `PHASE_2_SPEC.md` | BinaryStarInterface contract (consumed by Phase 3) |

---

## Locked Decisions

These were agreed before implementation began. Do not revisit.

### Decision 1: user_settings shape

The `customization` column is JSONB on the existing `user_settings` table. No new columns per config field.

```typescript
// TypeScript shape — validated by Zod at runtime
interface UserCustomization {
  halfLifeOverrides?: Partial<Record<LearningType, number>>      // days
  confidenceFloorOverrides?: Partial<Record<LearningType, number>> // 0–1
  qualityThreshold?: number                                        // 0–1, default 0.35
}
```

The existing `endOfSessionJudgeEnabled` column stays as-is (deployed in Phase 2). New config goes in the JSONB blob only.

### Decision 2: inject_learning HITL contract

- `extractionMethod = 'manual'` → **DIRECT WRITE** via `nebula.createLearning()`. User explicitly adding = no proposal needed.
- `extractionMethod = 'auto' | 'import'` → Creates learning with `confidenceBase = 0.3` (below injection threshold) AND creates a `ConductorProposal` with `type = 'promote'`, `requiresApproval = true`. Learning only promoted after human approval.

Test contract:
1. Manual write succeeds immediately with caller-specified `confidenceBase` (default 0.5)
2. Auto write creates learning at 0.3 + proposal
3. Approval promotes confidence to proposed value
4. Rejection archives the learning (sets `mutedAt`)

---

## Step 1: Migration `drizzle/0003_customization.sql`

```sql
-- drizzle/0003_customization.sql
-- Phase 3: Add customization JSONB column to user_settings

ALTER TABLE user_settings
  ADD COLUMN customization JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN user_settings.customization IS
  'Per-user Phase 3 config: halfLifeOverrides, confidenceFloorOverrides, qualityThreshold';
```

### 1.1 Amend `src/db/schema.ts`

Add to `userSettings` table definition, after `endOfSessionJudgeEnabled`:

```typescript
customization: jsonb('customization').notNull().default({}),
```

### 1.2 Apply migration

```bash
npx drizzle-kit generate --name customization
npx drizzle-kit migrate
```

---

## Step 2: `src/lib/customization/types.ts`

All Phase 3 types and Zod validation schemas. This is the single source of truth for request/response shapes.

```typescript
// src/lib/customization/types.ts
import { z } from 'zod'
import type { LearningType, ScopeFilter, TokenScope, Learning } from '@/lib/nebula/types'
import type { PodiumResult, InjectedLearning, QueryIntent, DomainSignal } from '@/lib/core'

// ---------------------------------------------------------------------------
// User Customization (stored in user_settings.customization JSONB)
// ---------------------------------------------------------------------------

const VALID_LEARNING_TYPES: LearningType[] = [
  'invariant', 'pattern', 'decision', 'antipattern', 'golden_path',
  'anchor', 'character', 'setting', 'plot_thread', 'voice', 'world_rule',
]

export const UserCustomizationSchema = z.object({
  halfLifeOverrides: z.record(
    z.enum(VALID_LEARNING_TYPES as [string, ...string[]]),
    z.number().positive(),
  ).optional(),
  confidenceFloorOverrides: z.record(
    z.enum(VALID_LEARNING_TYPES as [string, ...string[]]),
    z.number().min(0).max(1),
  ).optional(),
  qualityThreshold: z.number().min(0).max(1).optional(),
})

export type UserCustomization = z.infer<typeof UserCustomizationSchema>

// ---------------------------------------------------------------------------
// MCP Tool: read_nebula
// ---------------------------------------------------------------------------

export const ReadNebulaParamsSchema = z.object({
  userId: z.string().uuid(),
  learningId: z.string().uuid().optional(),
  scopes: z.array(z.string()).optional(),
  type: z.enum(VALID_LEARNING_TYPES as [string, ...string[]]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})

export type ReadNebulaParams = z.infer<typeof ReadNebulaParamsSchema>

export interface ReadNebulaResult {
  learnings: Learning[]
  total: number
}

// ---------------------------------------------------------------------------
// MCP Tool: get_context
// ---------------------------------------------------------------------------

export const GetContextParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  queryText: z.string().min(1),
  queryEmbedding: z.array(z.number()),
  scopeFilter: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    boost: z.array(z.string()).default([]),
  }),
  domainSignal: z.object({
    primary: z.string().nullable().default(null),
    confidence: z.number().min(0).max(1).default(0),
    detected: z.array(z.string()).default([]),
  }).optional(),
  intent: z.enum([
    'question', 'generation', 'analysis', 'debugging',
    'discussion', 'continuation', 'greeting',
  ] as const).default('question'),
  contextWindowSize: z.number().int().min(1).default(16000),
})

export type GetContextParams = z.infer<typeof GetContextParamsSchema>

export interface GetContextResult {
  compiledContext: string
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
}

// ---------------------------------------------------------------------------
// MCP Tool: inject_learning
// ---------------------------------------------------------------------------

export const InjectLearningParamsSchema = z.object({
  userId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  type: z.enum(VALID_LEARNING_TYPES as [string, ...string[]]),
  scopes: z.array(z.string().min(1)).min(1),
  extractionMethod: z.enum(['manual', 'auto', 'import']).default('manual'),
  confidenceBase: z.number().min(0).max(1).optional(),
  embedding: z.array(z.number()).optional(),
  embeddingDims: z.union([z.literal(384), z.literal(1536)]).optional(),
  embeddingModel: z.string().optional(),
})

export type InjectLearningParams = z.infer<typeof InjectLearningParamsSchema>

export interface InjectLearningResult {
  learning: Learning
  proposalCreated: boolean
  proposalId: string | null
}

// ---------------------------------------------------------------------------
// MCP Tool: submit_feedback
// ---------------------------------------------------------------------------

export const SubmitFeedbackParamsSchema = z.object({
  userId: z.string().uuid(),
  learningId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  injectionId: z.string().uuid().optional(),
  signal: z.enum(['positive', 'negative', 'none']),
  source: z.enum(['explicit', 'heuristic', 'inaction', 'llm_judge']).default('explicit'),
})

export type SubmitFeedbackParams = z.infer<typeof SubmitFeedbackParamsSchema>

export interface SubmitFeedbackResult {
  processed: true
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC envelope
// ---------------------------------------------------------------------------

export const MCPRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
})

export type MCPRequest = z.infer<typeof MCPRequestSchema>

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ---------------------------------------------------------------------------
// Auth context (returned by auth.ts after token verification)
// ---------------------------------------------------------------------------

export interface AuthContext {
  userId: string
  scopes: TokenScope[]
}

// ---------------------------------------------------------------------------
// Tool → required scope mapping
// ---------------------------------------------------------------------------

export const TOOL_SCOPES: Record<string, TokenScope> = {
  read_nebula:      'read:nebula',
  get_context:      'read:nebula',
  inject_learning:  'write:nebula',
  submit_feedback:  'write:feedback',
}
```

---

## Step 3: `src/lib/customization/auth.ts`

Bearer token extraction, bcrypt verification, and scope enforcement.

```typescript
// src/lib/customization/auth.ts
// MCP authentication — Bearer token + NextAuth session fallback.
// Token flow: Authorization header → extract plain token → bcrypt compare against
// api_tokens.hashed_token → validate not revoked/expired → return AuthContext.
//
// Co-located Shell uses NextAuth session (checked first). External MCP clients use Bearer.

import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { apiTokens } from '@/db/schema'
import { eq, isNull, or, gt } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import type { AuthContext } from './types'
import type { TokenScope } from '@/lib/nebula/types'
import { TOOL_SCOPES } from './types'

/**
 * Authenticate an incoming request. Tries NextAuth session first (co-located),
 * then Bearer token (external MCP clients).
 *
 * Returns AuthContext on success, null on failure.
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
  // 1. Try NextAuth session (co-located Shell)
  const session = await auth()
  if (session?.user?.id) {
    // Session-authenticated users get all scopes (they're the owner)
    return {
      userId: session.user.id,
      scopes: ['read:nebula', 'write:nebula', 'write:feedback', 'admin'],
    }
  }

  // 2. Try Bearer token (external MCP clients)
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const plainToken = authHeader.slice(7)
  if (!plainToken) return null

  return verifyBearerToken(plainToken)
}

/**
 * Verify a plain Bearer token against the api_tokens table.
 * Uses bcrypt compare — the token is hashed at creation time.
 *
 * Performance note: This scans all active tokens for the bcrypt match.
 * At expected scale (< 100 tokens per user), this is acceptable.
 * If scale grows, add a token prefix index (first 8 chars, plaintext)
 * to narrow the scan before bcrypt compare.
 */
async function verifyBearerToken(plainToken: string): Promise<AuthContext | null> {
  const now = new Date()

  // Fetch all active (non-revoked) tokens
  const activeTokens = await db
    .select()
    .from(apiTokens)
    .where(isNull(apiTokens.revokedAt))

  for (const token of activeTokens) {
    // Check expiry
    if (token.expiresAt && token.expiresAt < now) continue

    // bcrypt compare
    const match = await bcrypt.compare(plainToken, token.hashedToken)
    if (!match) continue

    // Update last_used_at (fire-and-forget)
    db.update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, token.id))
      .catch(() => { /* non-critical */ })

    return {
      userId: token.userId,
      scopes: (token.scopes as TokenScope[]) ?? [],
    }
  }

  return null
}

/**
 * Check if the authenticated user has the required scope for a tool.
 */
export function hasScope(auth: AuthContext, tool: string): boolean {
  const required = TOOL_SCOPES[tool]
  if (!required) return false

  // Admin scope grants everything
  if (auth.scopes.includes('admin')) return true

  return auth.scopes.includes(required)
}

/**
 * Enforce that the authenticated userId matches the requested userId.
 * Prevents token-holder A from accessing user B's data.
 * Admin scope bypasses this check (for future team/federation features).
 */
export function enforceOwnership(auth: AuthContext, requestedUserId: string): boolean {
  if (auth.scopes.includes('admin')) return true
  return auth.userId === requestedUserId
}
```

---

## Step 4: `src/lib/customization/handlers.ts`

The 4 MCP tool handler functions. These contain the real logic — called by both `LocalChorumClient` (direct import) and the MCP route (via HTTP).

```typescript
// src/lib/customization/handlers.ts
// Shared handler functions for all 4 MCP tools.
// Called directly by LocalChorumClient and via HTTP by MCPChorumClient.
// Each handler receives validated params + auth context.
// Layer 2 may only call NebulaInterface and BinaryStarInterface — no internal imports.

import { createNebula } from '@/lib/nebula'
import { createBinaryStar } from '@/lib/core'
import type { PodiumRequest, DomainSignal } from '@/lib/core'
import type {
  ReadNebulaParams, ReadNebulaResult,
  GetContextParams, GetContextResult,
  InjectLearningParams, InjectLearningResult,
  SubmitFeedbackParams, SubmitFeedbackResult,
  AuthContext,
} from './types'

// Singleton instances — same pattern as Nebula and BinaryStar
function getNebula() { return createNebula() }
function getBinaryStar() { return createBinaryStar(getNebula()) }

// ---------------------------------------------------------------------------
// read_nebula
// ---------------------------------------------------------------------------

export async function handleReadNebula(
  params: ReadNebulaParams,
  auth: AuthContext,
): Promise<ReadNebulaResult> {
  const nebula = getNebula()

  // Single learning lookup by ID
  if (params.learningId) {
    const learning = await nebula.getLearning(params.learningId)
    if (!learning || learning.userId !== auth.userId) {
      return { learnings: [], total: 0 }
    }
    return { learnings: [learning], total: 1 }
  }

  // Scope-based listing
  const scopes = params.scopes ?? []
  const all = await nebula.getLearningsByScope(scopes, params.userId)

  // Filter by type if specified
  const filtered = params.type
    ? all.filter((l) => l.type === params.type)
    : all

  // Paginate
  const total = filtered.length
  const page = filtered.slice(params.offset, params.offset + params.limit)

  return { learnings: page, total }
}

// ---------------------------------------------------------------------------
// get_context
// ---------------------------------------------------------------------------

export async function handleGetContext(
  params: GetContextParams,
  auth: AuthContext,
): Promise<GetContextResult> {
  const binaryStar = getBinaryStar()

  const domainSignal: DomainSignal = params.domainSignal ?? {
    primary: null,
    confidence: 0,
    detected: [],
  }

  const request: PodiumRequest = {
    userId: params.userId,
    conversationId: params.conversationId,
    queryText: params.queryText,
    queryEmbedding: params.queryEmbedding,
    scopeFilter: params.scopeFilter,
    domainSignal,
    intent: params.intent,
    contextWindowSize: params.contextWindowSize,
  }

  const result = await binaryStar.getContext(request)

  return {
    compiledContext: result.compiledContext,
    injectedItems: result.injectedItems,
    tierUsed: result.tierUsed,
    tokensUsed: result.tokensUsed,
  }
}

// ---------------------------------------------------------------------------
// inject_learning
// ---------------------------------------------------------------------------

export async function handleInjectLearning(
  params: InjectLearningParams,
  auth: AuthContext,
): Promise<InjectLearningResult> {
  const nebula = getNebula()

  const isManual = params.extractionMethod === 'manual'

  // Manual writes use caller-specified confidence (default 0.5).
  // Auto/import writes are created at 0.3 (below injection threshold)
  // and require human approval to promote.
  const confidenceBase = isManual
    ? (params.confidenceBase ?? 0.5)
    : 0.3

  const learning = await nebula.createLearning({
    userId: params.userId,
    content: params.content,
    type: params.type,
    scopes: params.scopes,
    extractionMethod: params.extractionMethod,
    confidenceBase,
    embedding: params.embedding,
    embeddingDims: params.embeddingDims,
    embeddingModel: params.embeddingModel,
  })

  // For auto/import: create a ConductorProposal for human review
  let proposalId: string | null = null
  if (!isManual) {
    const { createProposal } = await import('@/lib/core/conductor/proposals')
    const proposal = await createProposal(
      params.userId,
      learning.id,
      'promote',
      0.2,  // delta to bring from 0.3 to 0.5 on approval
      `Auto-extracted learning requires human approval. Content: "${params.content.slice(0, 100)}..."`,
    )
    proposalId = proposal.id
  }

  return {
    learning,
    proposalCreated: !isManual,
    proposalId,
  }
}

// ---------------------------------------------------------------------------
// submit_feedback
// ---------------------------------------------------------------------------

export async function handleSubmitFeedback(
  params: SubmitFeedbackParams,
  auth: AuthContext,
): Promise<SubmitFeedbackResult> {
  const binaryStar = getBinaryStar()

  await binaryStar.submitSignal({
    type: params.source as 'explicit' | 'heuristic' | 'inaction' | 'end_of_session_judge',
    learningId: params.learningId,
    conversationId: params.conversationId ?? '',
    injectionId: params.injectionId ?? '',
    signal: params.signal,
    source: params.source,
    timestamp: new Date(),
  })

  return { processed: true }
}
```

**IMPORTANT NOTE for Codex:** The `handleInjectLearning` function imports `createProposal` from `@/lib/core/conductor/proposals` via dynamic import. This is a **Layer 2 → Layer 1 internal** import, which technically violates the layer contract (Layer 2 should only use `BinaryStarInterface`).

**Fix:** Add a `createProposal` method to `BinaryStarInterface` in `src/lib/core/interface.ts`:

```typescript
// Add to BinaryStarInterface:
createProposal(userId: string, learningId: string, type: ProposalType, delta: number, rationale: string): Promise<ConductorProposal>
```

Then wire it through `BinaryStarImpl` → `ConductorImpl` → `proposals.ts`. This keeps the layer contract clean. The handler then calls `binaryStar.createProposal(...)` instead of the direct import.

---

## Step 5: `src/app/api/mcp/route.ts`

Replaces the 501 stub. Parses JSON-RPC, authenticates, routes to handlers.

```typescript
// src/app/api/mcp/route.ts
// MCP HTTP endpoint — JSON-RPC 2.0 over POST.
// Auth: Bearer token (external) or NextAuth session (co-located).
// Tools: read_nebula, get_context, inject_learning, submit_feedback.

import { NextResponse } from 'next/server'
import { authenticate, hasScope, enforceOwnership } from '@/lib/customization/auth'
import {
  MCPRequestSchema,
  ReadNebulaParamsSchema,
  GetContextParamsSchema,
  InjectLearningParamsSchema,
  SubmitFeedbackParamsSchema,
  TOOL_SCOPES,
} from '@/lib/customization/types'
import type { MCPResponse } from '@/lib/customization/types'
import {
  handleReadNebula,
  handleGetContext,
  handleInjectLearning,
  handleSubmitFeedback,
} from '@/lib/customization/handlers'

function jsonrpcError(id: string | number | null, code: number, message: string, data?: unknown): MCPResponse {
  return { jsonrpc: '2.0', id: id ?? 0, error: { code, message, data } }
}

function jsonrpcSuccess(id: string | number, result: unknown): MCPResponse {
  return { jsonrpc: '2.0', id, result }
}

export async function POST(request: Request) {
  // --- Auth ---
  const authCtx = await authenticate(request)
  if (!authCtx) {
    return NextResponse.json(
      jsonrpcError(null, -32000, 'Unauthorized: invalid or missing Bearer token'),
      { status: 401 },
    )
  }

  // --- Parse JSON-RPC envelope ---
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      jsonrpcError(null, -32700, 'Parse error: invalid JSON'),
      { status: 400 },
    )
  }

  const envelope = MCPRequestSchema.safeParse(body)
  if (!envelope.success) {
    return NextResponse.json(
      jsonrpcError(null, -32600, 'Invalid Request', envelope.error.issues),
      { status: 400 },
    )
  }

  const { id, method, params } = envelope.data

  // --- Scope check ---
  if (!hasScope(authCtx, method)) {
    return NextResponse.json(
      jsonrpcError(id, -32000, `Forbidden: token lacks scope '${TOOL_SCOPES[method] ?? method}'`),
      { status: 403 },
    )
  }

  // --- Route to handler ---
  try {
    switch (method) {
      case 'read_nebula': {
        const parsed = ReadNebulaParamsSchema.safeParse(params)
        if (!parsed.success) {
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues))
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
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues))
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
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues))
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
          return NextResponse.json(jsonrpcError(id, -32602, 'Invalid params', parsed.error.issues))
        }
        if (!enforceOwnership(authCtx, parsed.data.userId)) {
          return NextResponse.json(jsonrpcError(id, -32000, 'Forbidden: userId mismatch'), { status: 403 })
        }
        const result = await handleSubmitFeedback(parsed.data, authCtx)
        return NextResponse.json(jsonrpcSuccess(id, result))
      }

      default:
        return NextResponse.json(jsonrpcError(id, -32601, `Method not found: ${method}`))
    }
  } catch (err) {
    console.error(`[MCP] Error handling ${method}:`, err)
    return NextResponse.json(
      jsonrpcError(id, -32603, 'Internal error', err instanceof Error ? err.message : undefined),
      { status: 500 },
    )
  }
}

// Keep GET for health checks
export async function GET() {
  return NextResponse.json({ status: 'ok', version: '2.0.0-alpha.3', tools: Object.keys(TOOL_SCOPES) })
}
```

---

## Step 6: `src/lib/customization/client.ts`

ChorumClient transport adapter — the contract consumed by Shell (Phase 5) and external integrations.

```typescript
// src/lib/customization/client.ts
// ChorumClient — transport adapter.
// Shell always calls ChorumClient, never reaches into Layers 0 or 1 directly.
// LocalChorumClient: direct import (co-located Next.js).
// MCPChorumClient: HTTP POST (external clients: Claude Desktop, Cursor, etc).

import type {
  ReadNebulaParams, ReadNebulaResult,
  GetContextParams, GetContextResult,
  InjectLearningParams, InjectLearningResult,
  SubmitFeedbackParams, SubmitFeedbackResult,
  AuthContext, MCPResponse,
} from './types'
import {
  handleReadNebula,
  handleGetContext,
  handleInjectLearning,
  handleSubmitFeedback,
} from './handlers'

// ---------------------------------------------------------------------------
// Interface — the contract
// ---------------------------------------------------------------------------

export interface ChorumClient {
  readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult>
  getContext(params: GetContextParams): Promise<GetContextResult>
  injectLearning(params: InjectLearningParams): Promise<InjectLearningResult>
  submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult>
}

// ---------------------------------------------------------------------------
// LocalChorumClient — direct import, no HTTP
// Used by co-located Next.js App Router (Shell, Phase 5)
// ---------------------------------------------------------------------------

export class LocalChorumClient implements ChorumClient {
  constructor(private auth: AuthContext) {}

  async readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult> {
    return handleReadNebula(params, this.auth)
  }

  async getContext(params: GetContextParams): Promise<GetContextResult> {
    return handleGetContext(params, this.auth)
  }

  async injectLearning(params: InjectLearningParams): Promise<InjectLearningResult> {
    return handleInjectLearning(params, this.auth)
  }

  async submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult> {
    return handleSubmitFeedback(params, this.auth)
  }
}

// ---------------------------------------------------------------------------
// MCPChorumClient — HTTP transport
// Used by external clients (Claude Desktop, Cursor, Windsurf, CLI)
// ---------------------------------------------------------------------------

export class MCPChorumClient implements ChorumClient {
  constructor(
    private baseUrl: string,     // e.g. 'https://chorum.example.com/api/mcp'
    private bearerToken: string, // plain token (not hashed)
  ) {}

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`MCP request failed (${response.status}): ${text}`)
    }

    const json = await response.json() as MCPResponse
    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`)
    }

    return json.result as T
  }

  async readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult> {
    return this.call('read_nebula', params as unknown as Record<string, unknown>)
  }

  async getContext(params: GetContextParams): Promise<GetContextResult> {
    return this.call('get_context', params as unknown as Record<string, unknown>)
  }

  async injectLearning(params: InjectLearningParams): Promise<InjectLearningResult> {
    return this.call('inject_learning', params as unknown as Record<string, unknown>)
  }

  async submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult> {
    return this.call('submit_feedback', params as unknown as Record<string, unknown>)
  }
}
```

---

## Step 7: `src/lib/customization/domain-seeds.ts`

Domain seed CRUD and cluster viewing. Seeds are LLM-readable hints for known domain signals — not a fixed enum.

```typescript
// src/lib/customization/domain-seeds.ts
// Domain seed management — CRUD for domain_seeds + read-only view of domain_clusters.
// Seeds are starting points for domain detection. New seeds can be added dynamically
// as the graph discovers new territory. There is NO 'general' fallback category.

import { db } from '@/db'
import { domainSeeds, domainClusters } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const CreateSeedSchema = z.object({
  label: z.string().min(1).max(50).refine(
    (val) => val !== 'general',
    { message: "The label 'general' is forbidden — domains must be specific" },
  ),
  signalKeywords: z.array(z.string().min(1)),
  preferredTypes: z.record(z.string(), z.number().min(0).max(1)),
  isSystem: z.boolean().default(false),
})

export type CreateSeedInput = z.infer<typeof CreateSeedSchema>

export const UpdateSeedSchema = z.object({
  label: z.string().min(1).max(50).refine(
    (val) => val !== 'general',
    { message: "The label 'general' is forbidden — domains must be specific" },
  ).optional(),
  signalKeywords: z.array(z.string().min(1)).optional(),
  preferredTypes: z.record(z.string(), z.number().min(0).max(1)).optional(),
})

export type UpdateSeedInput = z.infer<typeof UpdateSeedSchema>

// ---------------------------------------------------------------------------
// Seed CRUD
// ---------------------------------------------------------------------------

export async function listSeeds() {
  return db.select().from(domainSeeds)
}

export async function getSeed(id: string) {
  const [row] = await db.select().from(domainSeeds).where(eq(domainSeeds.id, id))
  return row ?? null
}

export async function createSeed(input: CreateSeedInput) {
  const [row] = await db.insert(domainSeeds).values({
    label: input.label,
    signalKeywords: input.signalKeywords,
    preferredTypes: input.preferredTypes,
    isSystem: input.isSystem,
  }).returning()
  return row
}

export async function updateSeed(id: string, input: UpdateSeedInput) {
  const updates: Record<string, unknown> = {}
  if (input.label !== undefined) updates.label = input.label
  if (input.signalKeywords !== undefined) updates.signalKeywords = input.signalKeywords
  if (input.preferredTypes !== undefined) updates.preferredTypes = input.preferredTypes

  if (Object.keys(updates).length === 0) return getSeed(id)

  const [row] = await db
    .update(domainSeeds)
    .set(updates)
    .where(eq(domainSeeds.id, id))
    .returning()
  return row ?? null
}

export async function deleteSeed(id: string) {
  // Only allow deletion of non-system seeds
  const seed = await getSeed(id)
  if (!seed) return false
  if (seed.isSystem) {
    throw new Error('Cannot delete system seeds — disable or rename instead')
  }
  await db.delete(domainSeeds).where(eq(domainSeeds.id, id))
  return true
}

// ---------------------------------------------------------------------------
// Cluster viewing (read-only — clusters are recomputed by background job)
// ---------------------------------------------------------------------------

export async function listClusters(userId: string) {
  return db.select().from(domainClusters).where(eq(domainClusters.userId, userId))
}

export async function getCluster(id: string) {
  const [row] = await db.select().from(domainClusters).where(eq(domainClusters.id, id))
  return row ?? null
}
```

---

## Step 8: `src/lib/customization/config.ts`

Per-user decay/confidence configuration overrides.

```typescript
// src/lib/customization/config.ts
// Per-user customization config — reads/writes user_settings.customization JSONB.
// Falls back to system defaults (from conductor/decay.ts) when no override exists.

import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { UserCustomizationSchema } from './types'
import type { UserCustomization } from './types'
import type { LearningType } from '@/lib/nebula/types'
import { HALF_LIFE_DAYS, CONFIDENCE_FLOOR } from '@/lib/core/conductor/decay'

// ---------------------------------------------------------------------------
// Read config
// ---------------------------------------------------------------------------

export async function getUserCustomization(userId: string): Promise<UserCustomization> {
  const [row] = await db
    .select({ customization: userSettings.customization })
    .from(userSettings)
    .where(eq(userSettings.id, userId))

  if (!row) return {}

  const parsed = UserCustomizationSchema.safeParse(row.customization)
  return parsed.success ? parsed.data : {}
}

/**
 * Get the effective half-life for a learning type, with user overrides applied.
 */
export async function getEffectiveHalfLife(
  userId: string,
  type: LearningType,
): Promise<number | undefined> {
  const config = await getUserCustomization(userId)
  return config.halfLifeOverrides?.[type] ?? HALF_LIFE_DAYS[type]
}

/**
 * Get the effective confidence floor for a learning type, with user overrides applied.
 */
export async function getEffectiveConfidenceFloor(
  userId: string,
  type: LearningType,
): Promise<number> {
  const config = await getUserCustomization(userId)
  return config.confidenceFloorOverrides?.[type] ?? CONFIDENCE_FLOOR[type] ?? 0
}

/**
 * Get the effective quality threshold for Podium injection, with user override.
 */
export async function getEffectiveQualityThreshold(userId: string): Promise<number> {
  const config = await getUserCustomization(userId)
  return config.qualityThreshold ?? 0.35
}

// ---------------------------------------------------------------------------
// Write config
// ---------------------------------------------------------------------------

export async function updateUserCustomization(
  userId: string,
  updates: Partial<UserCustomization>,
): Promise<UserCustomization> {
  const current = await getUserCustomization(userId)

  const merged: UserCustomization = {
    ...current,
    ...updates,
    halfLifeOverrides: updates.halfLifeOverrides !== undefined
      ? { ...current.halfLifeOverrides, ...updates.halfLifeOverrides }
      : current.halfLifeOverrides,
    confidenceFloorOverrides: updates.confidenceFloorOverrides !== undefined
      ? { ...current.confidenceFloorOverrides, ...updates.confidenceFloorOverrides }
      : current.confidenceFloorOverrides,
  }

  // Validate merged result
  const validated = UserCustomizationSchema.parse(merged)

  // Upsert: insert if no row exists, update if it does
  await db
    .insert(userSettings)
    .values({
      id: userId,
      customization: validated,
    })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: {
        customization: validated,
        updatedAt: new Date(),
      },
    })

  return validated
}
```

---

## Step 9: `src/lib/customization/index.ts`

Public exports for Layer 2.

```typescript
// src/lib/customization/index.ts
// Layer 2 — Customization public surface
// Layer 3 (Agents) and Layer 4 (Shell) import from here only.

export type {
  ChorumClient,
} from './client'
export {
  LocalChorumClient,
  MCPChorumClient,
} from './client'

export type {
  ReadNebulaParams, ReadNebulaResult,
  GetContextParams, GetContextResult,
  InjectLearningParams, InjectLearningResult,
  SubmitFeedbackParams, SubmitFeedbackResult,
  UserCustomization, AuthContext,
} from './types'

export {
  handleReadNebula,
  handleGetContext,
  handleInjectLearning,
  handleSubmitFeedback,
} from './handlers'

export {
  getUserCustomization,
  updateUserCustomization,
  getEffectiveHalfLife,
  getEffectiveConfidenceFloor,
  getEffectiveQualityThreshold,
} from './config'

export {
  listSeeds,
  getSeed,
  createSeed,
  updateSeed,
  deleteSeed,
  listClusters,
  getCluster,
} from './domain-seeds'

export {
  authenticate,
  hasScope,
  enforceOwnership,
} from './auth'
```

---

## Step 10: BinaryStarInterface Amendment

Phase 3 requires `createProposal` to be accessible through `BinaryStarInterface` (not via internal import). Add to `src/lib/core/interface.ts`:

```typescript
// Add to BinaryStarInterface:
createProposal(
  userId: string,
  learningId: string,
  type: ProposalType,
  delta: number,
  rationale: string,
): Promise<ConductorProposal>
```

Wire through `src/lib/core/impl.ts`:

```typescript
async createProposal(
  userId: string, learningId: string, type: ProposalType,
  delta: number, rationale: string,
): Promise<ConductorProposal> {
  return this.conductor.createProposal(userId, learningId, type, delta, rationale)
}
```

And through `src/lib/core/conductor/conductor.ts`:

```typescript
async createProposal(
  userId: string, learningId: string, type: ProposalType,
  delta: number, rationale: string,
): Promise<ConductorProposal> {
  return createProposal(userId, learningId, type, delta, rationale)
}
```

Then update `handleInjectLearning` in handlers.ts to use `binaryStar.createProposal()` instead of the direct import.

---

## Step 11: Build Verification

```bash
npx next build
```

Expected: exit 0, zero TypeScript errors.

Common issues to resolve:
- `userSettings.customization` — Drizzle may need the column typed as `jsonb('customization').$type<UserCustomization>()` for type inference. If type mismatch errors occur, add explicit cast in `config.ts`.
- `auth()` import — verify `@/lib/auth` exports `auth` (the NextAuth helper). If it exports `authOptions` instead, adjust the import in `auth.ts`.
- `apiTokens.scopes` — the JSONB column returns `unknown`; cast to `TokenScope[]` as shown in `auth.ts`.
- `crypto.randomUUID()` in `MCPChorumClient` — available in Node 19+. If build fails, replace with `Math.random().toString(36).slice(2)` for ID generation.
- Zod v4 `.default()` on nested objects — if `GetContextParamsSchema` fails validation, ensure `.default()` is on the inner fields, not the parent.

---

## Step 12: Test Contract

### 12.1 Auth tests (`src/__tests__/customization/auth.test.ts`)

| Test | Assertion |
|------|-----------|
| Valid Bearer token → returns AuthContext | `authenticate(req)` returns `{ userId, scopes }` |
| Expired token → returns null | Token with `expiresAt` in the past is rejected |
| Revoked token → returns null | Token with `revokedAt` set is rejected |
| Missing Authorization header → returns null | No header = no auth |
| `hasScope('read_nebula', auth)` → true when `read:nebula` in scopes | Scope check passes |
| `hasScope('inject_learning', auth)` → false when only `read:nebula` | Scope check fails |
| `enforceOwnership` → false when userId mismatch | Ownership enforced |
| `enforceOwnership` → true when admin scope | Admin bypasses ownership |

### 12.2 Handler tests (`src/__tests__/customization/handlers.test.ts`)

| Test | Assertion |
|------|-----------|
| `handleReadNebula` with learningId → returns single learning | Learning returned if owned |
| `handleReadNebula` with scopes → returns filtered list | Type filter + pagination work |
| `handleGetContext` → returns PodiumResult shape | `compiledContext`, `tierUsed`, `tokensUsed` present |
| `handleInjectLearning` manual → direct write, no proposal | `proposalCreated: false` |
| `handleInjectLearning` auto → low confidence + proposal | `confidenceBase: 0.3`, `proposalCreated: true` |
| `handleSubmitFeedback` → calls submitSignal | `processed: true` |

### 12.3 Client parity tests (`src/__tests__/customization/client.test.ts`)

| Test | Assertion |
|------|-----------|
| `LocalChorumClient.readNebula` matches `handleReadNebula` output | Same result |
| `MCPChorumClient` sends correct JSON-RPC envelope | `jsonrpc: '2.0'`, correct method, Bearer header |

### 12.4 Domain seed tests (`src/__tests__/customization/domain-seeds.test.ts`)

| Test | Assertion |
|------|-----------|
| Create seed → returns with ID | Seed created with correct fields |
| Create seed with label 'general' → throws | Zod validation rejects |
| Update seed → returns updated fields | Only specified fields changed |
| Delete system seed → throws | System seeds are protected |
| Delete user seed → succeeds | Non-system seeds are deletable |

### 12.5 Config tests (`src/__tests__/customization/config.test.ts`)

| Test | Assertion |
|------|-----------|
| No config → returns system defaults | `getEffectiveHalfLife('pattern')` → 90 |
| With override → returns user value | Set `halfLifeOverrides.pattern: 120` → returns 120 |
| `updateUserCustomization` merges, not replaces | Existing fields preserved |

---

## Step 13: Guardian Validation

### 13.1 chorum-layer-guardian

Load `skills/chorum-layer-guardian/SKILL.md`. Audit all new files in `src/lib/customization/`.

**Expected:**
- No imports from `@/lib/agents`, `@/lib/providers`, or `@/app` in any customization file
- `handlers.ts` only imports from `@/lib/nebula` (public) and `@/lib/core` (public)
- No Layer 1 internal imports (no `@/lib/core/podium/*` or `@/lib/core/conductor/*`)
- `auth.ts` imports from `@/db` (database access is allowed at Layer 2)

### 13.2 mcp-contract-agent

Load `skills/mcp-contract-agent/SKILL.md` and run all checks.

| Check | Expected |
|-------|----------|
| 1. Tool surface | All 4 tools present: `read_nebula`, `get_context`, `inject_learning`, `submit_feedback` |
| 2. Auth | Bearer token required; scope enforcement on every tool |
| 3. HITL | `inject_learning` with `auto`/`import` creates proposal; `manual` is direct write |
| 4. ChorumClient | `LocalChorumClient` and `MCPChorumClient` both implement `ChorumClient` |
| 5. JSON-RPC | Envelope validated; error codes follow JSON-RPC 2.0 spec |
| 6. Ownership | `enforceOwnership` called for every tool with `userId` param |

---

## Completion Criteria

Map to `CHECKLIST_2.0.md` Phase 3 → Phase 4 Transition:

| Checklist Item | How to verify |
|----------------|---------------|
| MCP endpoint /api/mcp responds | `GET /api/mcp` returns `{ status: 'ok', tools: [...] }` |
| All 4 core tools implemented | Each tool handler exists and returns correct shape |
| Auth: Bearer token required, JWT verified | Unauthenticated POST → 401 |
| Human-in-the-loop: writes queued, reads free | `inject_learning(auto)` creates proposal |
| ChorumClient interface works (both transports) | `LocalChorumClient` and `MCPChorumClient` produce same results |
| Test with external client (Claude Desktop or Cursor) | Manual test with MCP client |
| mcp-contract-agent passes | All 6 checks pass |
| Domain seeds populated (coding, writing, trading) | 3 system seeds in `domain_seeds` table |
| Decay config accessible via API | `getUserCustomization` returns config; `updateUserCustomization` persists |

---

## Initial Domain Seeds (insert after migration)

Create `drizzle/0003b_seed_domains.sql`:

```sql
-- System domain seeds — shipped with Chorum v2
-- These are LLM-readable hints, not fixed categories.

INSERT INTO domain_seeds (label, signal_keywords, preferred_types, is_system) VALUES
(
  'coding',
  '["code", "function", "bug", "API", "database", "TypeScript", "Python", "deploy", "git", "test", "refactor", "performance", "algorithm", "variable", "class", "method"]',
  '{"invariant": 1.0, "anchor": 1.0, "pattern": 0.9, "decision": 0.8, "golden_path": 0.7, "antipattern": 0.6}',
  true
),
(
  'writing',
  '["character", "plot", "scene", "dialogue", "voice", "setting", "world", "story", "narrative", "chapter", "draft", "revision", "tone", "POV", "protagonist"]',
  '{"character": 1.0, "world_rule": 1.0, "anchor": 1.0, "plot_thread": 0.9, "voice": 0.8, "setting": 0.7}',
  true
),
(
  'trading',
  '["trade", "market", "position", "risk", "strategy", "signal", "indicator", "portfolio", "hedge", "volatility", "entry", "exit", "stop-loss", "momentum", "backtest"]',
  '{"invariant": 1.0, "anchor": 1.0, "decision": 0.9, "pattern": 0.8, "antipattern": 0.7, "golden_path": 0.6}',
  true
);
```

---

## Changelog Entry

Add to `CHANGELOG.md` under `[2.0.0-alpha.3]`:

```markdown
## [2.0.0-alpha.3] — Phase 3: Customization Layer (Layer 2)

### Added
- MCP endpoint at /api/mcp — JSON-RPC 2.0 over HTTP POST
- 4 core MCP tools: read_nebula, get_context, inject_learning, submit_feedback
- Bearer token authentication with bcrypt verify + scoped permissions
- NextAuth session fallback for co-located Shell
- Ownership enforcement: token-holder can only access own data
- ChorumClient transport adapter (LocalChorumClient + MCPChorumClient)
- Human-in-the-loop: auto/import writes create ConductorProposal; manual writes are direct
- Domain seed management: CRUD for domain_seeds, read-only view of domain_clusters
- 3 system domain seeds: coding, writing, trading
- Per-user customization config in user_settings.customization JSONB
- Configurable: halfLifeOverrides, confidenceFloorOverrides, qualityThreshold
- Migration 0003_customization.sql — customization JSONB column on user_settings
- Seed data migration 0003b_seed_domains.sql — 3 system domain seeds
- GET /api/mcp health check endpoint

### Architecture
- ChorumClient is the single transport abstraction for all Shell/external access
- Handlers are shared logic — both Local and MCP clients call the same functions
- Layer 2 imports only from public interfaces of Layer 0 (Nebula) and Layer 1 (BinaryStar)
- BinaryStarInterface extended: createProposal() exposed for Layer 2 HITL workflow
```

---

## Codex Notes

**Layer contract — no internal imports:** `handlers.ts` must NEVER import from `@/lib/core/podium/*` or `@/lib/core/conductor/*`. All access goes through `BinaryStarInterface` (from `@/lib/core`) and `NebulaInterface` (from `@/lib/nebula`). The one exception flagged in Step 4 (direct proposal import) must be fixed via the Step 10 amendment.

**No 'general' domain:** The `CreateSeedSchema` has an explicit `.refine()` that rejects `label: 'general'`. Do not remove this. If you find yourself writing `case 'general':` anywhere, delete it.

**Auth scanning performance:** The `verifyBearerToken` function scans all active tokens and bcrypt-compares each one. This is O(n) where n = active tokens. At expected scale (< 100 tokens), this is fine. Do NOT optimize prematurely (e.g., no token prefix index needed yet).

**Zod v4 compatibility:** The project uses `zod@^4.3.6`. In Zod v4, `.default()` returns a `ZodDefault` wrapper — ensure `safeParse` is called on the schema, not on a pre-transformed version. If defaults don't apply during parse, wrap params with `schema.parse(params)` instead of `safeParse`.

**MCPChorumClient is for external clients only:** The Shell (Phase 5) should always use `LocalChorumClient` when co-located. `MCPChorumClient` exists for Claude Desktop, Cursor, Windsurf, and other external MCP consumers. Do not use `MCPChorumClient` for server-side rendering.

**Test isolation:** Handler tests should mock `createNebula()` and `createBinaryStar()` — do not hit a real database. Use Vitest's `vi.mock()` for module mocking.
