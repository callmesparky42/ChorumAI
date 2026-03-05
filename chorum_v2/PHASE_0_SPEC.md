# Phase 0 Specification: Foundation & Pre-Implementation Contracts

**Version:** 1.0
**Date:** 2026-02-22
**Status:** Ready for execution
**Assigned to:** Codex 5.3
**Guardian gates:** `chorum-layer-guardian`, `nebula-schema-guardian` (baseline pass on empty scaffold)

---

## Agent Instructions

You are executing **Phase 0** of the Chorum 2.0 clean-room build. Your job is to produce a working Next.js scaffold and five locked pre-implementation spec documents. No application logic. No Nebula schema. No Podium or Conductor code. This phase ends when the app builds, auth works, and the five spec documents exist.

Read this document completely before writing a single file. Every decision is locked. If something feels ambiguous, re-read this document — the answer is here. If it is genuinely missing, flag it as a BLOCKER before proceeding; do not interpolate.

**What you will produce:**
1. A working Next.js 15 scaffold at `chorum-v2/` with Drizzle, Supabase Auth, and TypeScript strict mode
2. Five pre-implementation spec documents in `chorum-v2/docs/specs/`
3. Stub files establishing the directory tree (empty exports only — no logic)
4. A passing baseline run of `chorum-layer-guardian` and `nebula-schema-guardian`

**What you will NOT produce:**
- Any database migration files (Phase 1 responsibility)
- Any `src/lib/nebula/`, `src/lib/core/`, or `src/lib/agents/` implementation code
- Any UI components or page logic
- Any Podium, Conductor, or MCP implementation
- Any `any` types or `@ts-ignore` comments

---

## Reference Documents

These documents are your authoritative source of truth. Read them. Do not override them.

| Document | Location | What it governs |
|----------|----------|-----------------|
| Phase Architecture | `CHORUM_V2_PHASE_ARCHITECTURE.md` | Full build order, schema DDL, interface contracts, signal policy |
| Architecture Vision | `CHORUM_2.0_ARCHITECTURE.md` | Design principles, cosmology, success metrics |
| Deployment Checklist | `CHECKLIST_2.0.md` | Inter-phase gates, completion criteria |
| The Shift | `The_Shift.md` | Core design principles, resolved decisions |
| Skills | `skills/` | Guardian skills — run at phase boundaries |

---

## Step 1: Scaffold

### 1.1 Create Next.js app

```bash
# Run from c:/Users/dmill/Documents/GitHub/ChorumAI/
npx create-next-app@15 chorum-v2 \
  --typescript \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --tailwind \
  --no-eslint \
  --no-git
```

The `--no-git` flag is intentional — the parent `ChorumAI/` repo already tracks this.

### 1.2 Additional packages

```bash
cd chorum-v2

# Database + ORM
npm install drizzle-orm @supabase/supabase-js postgres
npm install -D drizzle-kit

# Auth
npm install next-auth@4 @auth/drizzle-adapter

# Vector / pgvector types for Drizzle
npm install drizzle-orm  # already installed; pgvector support is built in via customType

# Validation
npm install zod

# Utilities
npm install bcryptjs
npm install -D @types/bcryptjs
```

### 1.3 TypeScript configuration

In `tsconfig.json`, verify or add to `compilerOptions`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

`strict: true` already set by create-next-app. The three additions are required by this project's TypeScript contract.

### 1.4 drizzle.config.ts

Create at project root:

```typescript
// chorum-v2/drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config
```

### 1.5 .env.local.example

Create at project root (committed to repo — real values go in `.env.local` which is gitignored):

```bash
# Supabase
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Encryption (for provider API keys at rest)
ENCRYPTION_KEY=generate-with-openssl-rand-base64-32

# Optional: Local embedding model (for sovereignty tier)
# OLLAMA_BASE_URL=http://localhost:11434
```

### 1.6 Drizzle client

Create `src/db/index.ts`:

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

// Disable prefetch as it is not supported for transactions
const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema })
export type DB = typeof db
```

Create `src/db/schema.ts` (empty — Phase 1 writes this):

```typescript
// src/db/schema.ts
// Phase 1 writes this file. Do not add content here in Phase 0.
// This file exists so drizzle.config.ts resolves without error.
export {}
```

---

## Step 2: Directory Structure

Create this exact tree. Files marked `// stub` should contain only the comment shown — no logic, no imports beyond what's needed for TypeScript to not error.

```
chorum-v2/
├── docs/
│   └── specs/
│       ├── LAYER_CONTRACTS.md          ← Write in Step 4a
│       ├── NEBULA_SCHEMA_SPEC.md       ← Write in Step 4b
│       ├── PODIUM_INTERFACE_SPEC.md    ← Write in Step 4c
│       ├── CONDUCTOR_INTERFACE_SPEC.md ← Write in Step 4d
│       └── DOMAIN_SEEDS_SPEC.md        ← Write in Step 4e
├── drizzle/                            ← Created by drizzle-kit (leave empty)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts        ← Write in Step 3
│   │   │   └── mcp/
│   │   │       └── route.ts            ← stub: "// MCP endpoint — Phase 3"
│   │   ├── layout.tsx                  ← created by create-next-app; keep default
│   │   └── page.tsx                    ← created by create-next-app; keep default
│   ├── db/
│   │   ├── index.ts                    ← Written in Step 1.6
│   │   └── schema.ts                   ← Written in Step 1.6
│   └── lib/
│       ├── nebula/                     ← Layer 0 (Phase 1 implementation)
│       │   └── .gitkeep
│       ├── core/
│       │   ├── podium/                 ← Layer 1a (Phase 2 implementation)
│       │   │   └── .gitkeep
│       │   └── conductor/              ← Layer 1b (Phase 2 implementation)
│       │       └── .gitkeep
│       ├── customization/              ← Layer 2 (Phase 3 implementation)
│       │   └── .gitkeep
│       ├── agents/                     ← Layer 3 (Phase 4 implementation)
│       │   └── .gitkeep
│       ├── providers/                  ← copied from v1 in Phase 4; placeholder now
│       │   └── .gitkeep
│       └── auth.ts                     ← Write in Step 3
├── skills/                             ← Already present — do not modify
├── drizzle.config.ts                   ← Written in Step 1.4
├── .env.local.example                  ← Written in Step 1.5
├── CHANGELOG.md                        ← Write stub below
├── CHORUM_2.0_ARCHITECTURE.md          ← Already present
├── CHORUM_V2_PHASE_ARCHITECTURE.md     ← Already present
├── CHECKLIST_2.0.md                    ← Already present
├── The_Shift.md                        ← Already present
└── PHASE_0_SPEC.md                     ← This document
```

Create `CHANGELOG.md`:

```markdown
# Changelog

## [2.0.0-alpha.0] — Phase 0

### Added
- Next.js 15 scaffold with TypeScript strict mode, Drizzle ORM, Supabase Auth
- Five pre-implementation spec documents in `docs/specs/`
- Directory structure for all layers (stubs only — no implementation)
- Guardian skills in `skills/` (5 skills)
- `.env.local.example` with all required variables documented

### Architecture decisions locked
- Embedding architecture: two typed tables (`embeddings_1536`, `embeddings_384`) — not a column on `learnings`
- Signal policy: explicit thumbs only auto-applied in v2.0; heuristic/inaction stored as soft priors
- End-of-session judge: disabled by default; opt-in at Personal tier
- Confidence formula: `consistency_factor` (not `decay_factor`) — signal-history measure, not temporal decay
- Domain: emergent from scope tags; no `general` fallback; `DomainSignal.primary` is `string | null`
- Cross-lens access: gated by `allowCrossLens` flag (default false); audit-logged
```

---

## Step 3: Auth Wiring

### 3.1 src/lib/auth.ts

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth'
import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
  },
}

export const { auth, handlers, signIn, signOut } = NextAuth(authOptions)
```

Add to `.env.local.example`:

```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Add to `next-auth.d.ts` at project root:

```typescript
// next-auth.d.ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}
```

### 3.2 src/app/api/auth/[...nextauth]/route.ts

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

### 3.3 Auth in API routes (pattern reference)

Every Layer 4 API route that requires auth should follow this pattern:

```typescript
// Pattern — do not create this file; it's a reference for Phase 5
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const userId = session.user.id
  // ...
}
```

---

## Step 4: Pre-Implementation Spec Documents

Write each file exactly as specified. These documents are the locked contracts that Phases 1–5 implement against. Do not add features, remove sections, or editorialize. The section headers and structure must match exactly — guardian skills validate against them.

---

### 4a: docs/specs/LAYER_CONTRACTS.md

```markdown
# Layer Contracts

**Phase:** 0 (pre-implementation)
**Status:** Locked
**Governs:** Import direction, layer responsibilities, all inter-layer TypeScript interfaces

---

## Purpose

Define the explicit TypeScript interfaces at every layer boundary. No layer may call another except through its published interface. No inner layer may import from an outer layer. These contracts are enforced by `chorum-layer-guardian` at every phase boundary.

## Non-Goals

- Does not specify implementation details (those live in phase-specific specs)
- Does not define database schema (see NEBULA_SCHEMA_SPEC.md)
- Does not define MCP wire format (see CONDUCTOR_INTERFACE_SPEC.md Phase 3 addendum)

---

## Layer Map

| # | Name | Directory | Responsibility | May Import From |
|---|------|-----------|----------------|-----------------|
| 0 | Nebula | `src/lib/nebula/` | Persistent knowledge graph; CRUD; embedding search | Nothing in `src/lib/` |
| 1 | Binary Star | `src/lib/core/` | Podium (injection) + Conductor (feedback) | Layer 0 only |
| 2 | Customization | `src/lib/customization/` | Domain profiles, decay config, MCP surface, ChorumClient adapter | Layers 0–1 |
| 3 | Agents | `src/lib/agents/` | Personas, routing, tool access | Layers 0–2 |
| 4 | Shell | `src/app/` | UI, CLI, API routes — stateless | All layers (via interfaces only) |

**Import direction rule:** imports flow inward only. Layer N may import from layers < N. Layer N must never import from layers > N.

```
Layer 0 ← Layer 1 ← Layer 2 ← Layer 3 ← Layer 4
```

---

## Shared Primitive Types

```typescript
// src/lib/nebula/types.ts — shared across all layers
export type LearningType =
  | 'invariant'
  | 'pattern'
  | 'decision'
  | 'antipattern'
  | 'golden_path'
  | 'anchor'
  | 'character'
  | 'setting'
  | 'plot_thread'
  | 'voice'
  | 'world_rule'

export type LinkType = 'related' | 'supports' | 'contradicts' | 'supersedes'

export type ExtractionMethod = 'manual' | 'auto' | 'import'

export type SignalSource = 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'

export type SignalValue = 'positive' | 'negative' | 'none'

export interface ScopeFilter {
  include: string[]    // scope tags that must be present (AND)
  exclude: string[]    // scope tags that must not be present
  boost: string[]      // scope tags that add score bonus (OR)
}

export interface Learning {
  id: string
  userId: string
  teamId: string | null
  content: string
  type: LearningType
  confidenceBase: number    // raw score; never modified by decay tick
  confidence: number        // effective value; updated by nightly decay job
  extractionMethod: ExtractionMethod
  sourceConversationId: string | null
  pinnedAt: Date | null
  mutedAt: Date | null
  usageCount: number
  lastUsedAt: Date | null
  promotedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ScoredLearning extends Learning {
  score: number
  scopeMatchScore: number
  semanticScore: number
}

export interface LearningLink {
  id: string
  sourceId: string
  targetId: string
  linkType: LinkType
  strength: number
  createdAt: Date
}

export interface CooccurrenceEntry {
  learningId: string
  count: number
  positiveCount: number
  negativeCount: number
  lastSeen: Date
}

export interface Feedback {
  id: string
  userId: string
  learningId: string | null
  conversationId: string | null
  injectionId: string | null
  signal: SignalValue
  source: SignalSource
  processed: boolean
  createdAt: Date
}

export interface InjectionAuditEntry {
  id: string
  userId: string
  conversationId: string | null
  learningId: string | null
  included: boolean
  score: number
  reason: string | null
  excludeReason: string | null
  tierUsed: 1 | 2 | 3
  tokensUsed: number | null
  createdAt: Date
}

export interface ApiToken {
  id: string
  userId: string
  name: string
  hashedToken: string
  scopes: TokenScope[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export type TokenScope =
  | 'read:nebula'
  | 'write:nebula'
  | 'write:feedback'
  | 'admin'
```

---

## Layer 0 → Layer 1: NebulaInterface

The only export from `src/lib/nebula/` that Layer 1 may import is `NebulaInterface`. No direct table access from Layer 1.

```typescript
// src/lib/nebula/interface.ts
import type {
  Learning,
  ScoredLearning,
  LearningLink,
  LinkType,
  CooccurrenceEntry,
  Feedback,
  InjectionAuditEntry,
  ApiToken,
  ScopeFilter,
  ExtractionMethod,
  LearningType,
} from './types'

export interface CreateLearningInput {
  userId: string
  teamId?: string
  content: string
  type: LearningType
  extractionMethod: ExtractionMethod
  sourceConversationId?: string
  scopes: string[]
  confidenceBase?: number      // default 0.5
}

export interface FeedbackInput {
  userId: string
  learningId?: string
  conversationId?: string
  injectionId?: string
  signal: 'positive' | 'negative' | 'none'
  source: 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'
}

export interface CreateApiTokenInput {
  userId: string
  name: string
  scopes: string[]
  expiresAt?: Date
}

export interface NebulaInterface {
  // Node CRUD
  createLearning(input: CreateLearningInput): Promise<Learning>
  getLearning(id: string): Promise<Learning | null>
  updateLearning(id: string, patch: Partial<Learning>): Promise<Learning>
  deleteLearning(id: string): Promise<void>           // hard delete — explicit call required

  // Scope queries
  getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]>

  // Semantic search — queries best available embedding table (1536 → 384 → scope/recency)
  // allowCrossLens: if false (default), scope filter is enforced against caller's project scope_filter
  // Cross-lens access must be logged in injection_audit with reason = 'cross-lens'
  searchByEmbedding(
    embedding: number[],
    dims: 384 | 1536,
    scopeFilter: ScopeFilter,
    limit: number,
    allowCrossLens?: boolean
  ): Promise<ScoredLearning[]>

  // Embedding management
  setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void>
  hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean>
  getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]>

  // Graph
  createLink(sourceId: string, targetId: string, type: LinkType, strength: number): Promise<void>
  getLinksFor(learningId: string): Promise<LearningLink[]>

  // Co-occurrence
  recordCooccurrence(ids: string[]): Promise<void>
  getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]>

  // Feedback
  recordFeedback(input: FeedbackInput): Promise<void>
  getPendingFeedback(userId: string): Promise<Feedback[]>
  markFeedbackProcessed(ids: string[]): Promise<void>

  // Injection audit
  logInjectionAudit(entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[]): Promise<void>

  // API token auth
  validateApiToken(hashedToken: string): Promise<ApiToken | null>
  createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }>
  revokeApiToken(id: string): Promise<void>
}
```

---

## Layer 1 → Layer 2: BinaryStarInterface

The only export from `src/lib/core/` that Layer 2 may import.

```typescript
// src/lib/core/interface.ts
import type { ScopeFilter, Learning } from '@/lib/nebula/types'

// --- Podium types ---

export type QueryIntent =
  | 'question'
  | 'generation'
  | 'analysis'
  | 'debugging'
  | 'discussion'
  | 'continuation'
  | 'greeting'

export type QueryComplexity = 'simple' | 'moderate' | 'complex'

export interface DomainSignal {
  primary: string | null   // e.g. 'coding' | 'writing' | 'trading' — or null if unknown
  // null means domain is unclear. Podium scores all types; no domain boost applied.
  // There is no 'general' fallback domain.
  confidence: number       // 0–1
  detected: string[]       // all detected scope tags / cluster labels
}

export interface PodiumRequest {
  userId: string
  conversationId: string
  queryText: string
  queryEmbedding: number[]     // pre-computed — never deferred
  scopeFilter: ScopeFilter
  domainSignal: DomainSignal
  intent: QueryIntent
  contextWindowSize: number    // determines tier
}

export interface InjectedLearning {
  id: string
  content: string
  type: string
  confidence: number
  relevanceScore: number
  tokenCount: number
}

export interface PodiumResult {
  injectedItems: InjectedLearning[]
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  compiledContext: string
  auditEntries: {
    learningId: string | null
    included: boolean
    score: number
    reason: string | null
    excludeReason: string | null
  }[]
}

// --- Conductor types ---

export type ConductorSignalType = 'explicit' | 'heuristic' | 'inaction' | 'end_of_session_judge'

export interface ConductorSignal {
  type: ConductorSignalType
  learningId: string
  conversationId: string
  injectionId: string          // links to Podium audit entry
  signal: 'positive' | 'negative' | 'none'
  source: string
  timestamp: Date
}

export type ProposalType = 'promote' | 'demote' | 'archive' | 'merge'

export interface ConductorProposal {
  id: string
  type: ProposalType
  targetLearningId: string
  confidenceDelta: number      // applied to confidence_base
  rationale: string
  requiresHumanApproval: boolean
  expiresAt: Date
  createdAt: Date
}

export interface BinaryStarInterface {
  // Podium
  getContext(request: PodiumRequest): Promise<PodiumResult>

  // Conductor
  submitSignal(signal: ConductorSignal): Promise<void>
  getProposals(userId: string): Promise<ConductorProposal[]>
  approveProposal(proposalId: string, userId: string): Promise<void>
  rejectProposal(proposalId: string, userId: string): Promise<void>
}
```

---

## Layer 2 → Layer 3: ChorumClientInterface

The interface Agents call. Implemented by either `LocalChorumClient` (co-located) or `MCPChorumClient` (external). Layer 3 never imports transport details.

```typescript
// src/lib/customization/client.ts
export interface ReadNebulaParams {
  userId: string
  query: string
  scopes?: string[]
  limit?: number
  minConfidence?: number
}

export interface ReadNebulaResult {
  learnings: {
    id: string
    content: string
    type: string
    confidence: number
    scopes: string[]
    relevanceScore: number
  }[]
  totalMatches: number
}

export interface GetContextParams {
  userId: string
  conversationId?: string
  query: string
  scopes?: string[]
  domain?: string
  maxTokens?: number
  tier?: 1 | 2 | 3
}

export interface GetContextResult {
  compiledContext: string
  tierUsed: 1 | 2 | 3
  tokensUsed: number
  itemCount: number
  learningIds: string[]
  auditSummary: string
}

export interface InjectLearningParams {
  userId: string
  content: string
  type: string
  scopes: string[]
  source?: 'manual' | 'import' | 'extraction'
  confidence?: number
  conversationId?: string
}

export interface InjectLearningResult {
  id: string
  status: 'created' | 'queued'
  message: string
}

export interface SubmitFeedbackParams {
  userId: string
  learningId: string
  signal: 'positive' | 'negative'
  conversationId?: string
  injectionId?: string
  reason?: string
}

export interface SubmitFeedbackResult {
  received: boolean
  adjustmentApplied: boolean
  newConfidence?: number
}

export interface ChorumClientInterface {
  readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult>
  getContext(params: GetContextParams): Promise<GetContextResult>
  injectLearning(params: InjectLearningParams): Promise<InjectLearningResult>
  submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult>
}
```

---

## Layer 3 → Layer 4: AgentInterface

The interface Shell calls. Layer 4 never calls Layer 2 or below directly.

```typescript
// src/lib/agents/interface.ts
export interface AgentDefinition {
  id: string
  name: string
  description: string
  scopeFilter: string[]       // default scopes this agent operates in
  systemPromptTemplate: string
  temperature: number
  maxTokens: number
  guardrails: string[]
}

export interface AgentChatInput {
  userId: string
  conversationId: string
  message: string
  agentId?: string             // if null, route automatically
  history: { role: 'user' | 'assistant'; content: string }[]
  contextWindowSize: number
}

export interface AgentChatResult {
  response: string
  agentUsed: AgentDefinition
  injectedContext: string
  tokensUsed: number
  conversationId: string
}

export interface AgentInterface {
  chat(input: AgentChatInput): AsyncGenerator<string>    // streaming
  chatSync(input: AgentChatInput): Promise<AgentChatResult>
  getAgents(userId: string): Promise<AgentDefinition[]>
  route(query: string, userId: string): Promise<AgentDefinition>
}
```

---

## Invariants

1. **No outer→inner imports.** Layer N may never import from Layer > N. `chorum-layer-guardian` enforces this.
2. **Shell is stateless.** `src/app/` contains no business logic, no scoring, no confidence adjustments.
3. **Interfaces are the contracts.** If implementation diverges from these interfaces, update the spec first, then the code.
4. **`NebulaInterface` is the only Nebula export.** No direct table imports from Layer 1+.
5. **`any` is forbidden** without a documented justification comment.

## Error Handling

- Layer 0 throws typed errors: `class NebulaError extends Error { constructor(code: NebulaErrorCode, message: string) }`
- Layer 1 wraps Layer 0 errors — does not re-expose DB error internals to Layer 2+
- Layer 4 maps errors to HTTP status codes — never expose stack traces to clients
- All async functions declare return types (no inferred `Promise<any>`)

## Testing Contract

- Every interface method must have at least one unit test by the time its phase ships
- Invariant violations must have negative tests (prove that Layer 0 cannot be imported from Layer 2)
- Test files live adjacent to source: `src/lib/nebula/interface.test.ts`

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Business logic in `src/app/api/` routes | Shell is stateless; all logic in lib layers |
| No defined interfaces between learning and relevance systems | This document — every boundary is typed |
| `projectLearningPaths` — learnings owned by projects | Learnings tagged, never owned; projects are scope filters |
| Relevance engine imported directly in API routes | Layer 4 calls `AgentInterface` only |
```

---

### 4b: docs/specs/NEBULA_SCHEMA_SPEC.md

```markdown
# Nebula Schema Specification

**Phase:** 0 (pre-implementation) → implements in Phase 1
**Status:** Locked
**Migration:** `drizzle/0001_nebula_core.sql` (written in Phase 1)
**Guardian:** `nebula-schema-guardian`

---

## Purpose

Define the complete database schema for the Zettelkasten (Layer 0). This is the persistent substrate — everything else reads from and writes to these tables. This spec is the source of truth for migration `0001`. Do not write the migration until this spec is reviewed and committed.

## Non-Goals

- Does not specify Podium or Conductor query logic (see their specs)
- Does not specify domain-specific extraction behavior (see DOMAIN_SEEDS_SPEC.md)
- Does not specify MCP or API surface (see Phase 3)
- Does not specify decay formulas (see PODIUM_INTERFACE_SPEC.md)

---

## Design Principles

1. **Learnings are tagged, never owned.** No FK from `learnings` to `projects`.
2. **Federation from day one.** Every table has `user_id NOT NULL` and `team_id UUID` (nullable).
3. **Embeddings in typed tables.** `learnings` has no embedding column. Two separate tables: `embeddings_1536` (cloud) and `embeddings_384` (local/sovereign). Mixing dimensions in a single column corrupts cosine similarity in pgvector.
4. **Types as TEXT.** Never ENUM. Domain types expand; ENUMs require migrations.
5. **Confidence split.** `confidence_base` is set by Conductor from feedback signals; never touched by the decay tick. `confidence` is the effective value updated nightly by the decay job. Invariant: `confidence ≤ confidence_base`.
6. **Domain is emergent.** No domain column on learnings. Domain clusters form from scope tag co-occurrence. No `general` fallback.

---

## Tables

### `learnings` — Core learning node

```sql
CREATE TABLE learnings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  team_id               UUID,                       -- federation: nullable now, required in 3.0
  content               TEXT NOT NULL,
  type                  TEXT NOT NULL,              -- see type registry
  confidence_base       FLOAT NOT NULL DEFAULT 0.5, -- Conductor writes; never touched by decay tick
  confidence            FLOAT NOT NULL DEFAULT 0.5, -- effective value; nightly decay job updates this
  extraction_method     TEXT NOT NULL,              -- 'manual' | 'auto' | 'import'
  source_conversation_id UUID,
  pinned_at             TIMESTAMPTZ,                -- Conductor cannot touch if non-null
  muted_at              TIMESTAMPTZ,                -- Podium never injects if non-null
  usage_count           INTEGER NOT NULL DEFAULT 0,
  last_used_at          TIMESTAMPTZ,
  promoted_at           TIMESTAMPTZ,                -- usage_count >= 10 → guaranteed Tier 1/2
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT confidence_invariant CHECK (confidence <= confidence_base),
  CONSTRAINT confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT confidence_base_range CHECK (confidence_base >= 0 AND confidence_base <= 1)
);
```

### `embeddings_1536` — Cloud embeddings

```sql
CREATE TABLE embeddings_1536 (
  learning_id           UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding             VECTOR(1536) NOT NULL,
  model_name            TEXT NOT NULL,              -- 'text-embedding-3-small' | 'text-embedding-3-large'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `embeddings_384` — Local embeddings (sovereignty-safe)

```sql
CREATE TABLE embeddings_384 (
  learning_id           UUID PRIMARY KEY REFERENCES learnings ON DELETE CASCADE,
  embedding             VECTOR(384) NOT NULL,
  model_name            TEXT NOT NULL,              -- 'all-MiniLM-L6-v2' | 'nomic-embed-text-v1.5'
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `learning_scopes` — Scope tags (many-to-many)

```sql
CREATE TABLE learning_scopes (
  learning_id           UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  scope                 TEXT NOT NULL,              -- '#python', '#trading', '#fiction'
  PRIMARY KEY (learning_id, scope)
);
```

### `learning_links` — Zettelkasten edges

```sql
CREATE TABLE learning_links (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  target_id             UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  link_type             TEXT NOT NULL,              -- 'related'|'supports'|'contradicts'|'supersedes'
  strength              FLOAT NOT NULL DEFAULT 0.5,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_link CHECK (source_id != target_id)
);
```

### `cooccurrence` — Usage cohort tracking

```sql
CREATE TABLE cooccurrence (
  learning_a            UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  learning_b            UUID NOT NULL REFERENCES learnings ON DELETE CASCADE,
  count                 INTEGER NOT NULL DEFAULT 1,
  positive_count        INTEGER NOT NULL DEFAULT 0,
  negative_count        INTEGER NOT NULL DEFAULT 0,
  last_seen             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (learning_a, learning_b),
  CONSTRAINT ordered_pair CHECK (learning_a < learning_b)
);
```

### `feedback` — All feedback signals

```sql
CREATE TABLE feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  learning_id           UUID REFERENCES learnings ON DELETE CASCADE,
  conversation_id       UUID,
  injection_id          UUID,                       -- links to injection_audit.id
  signal                TEXT NOT NULL,              -- 'positive' | 'negative' | 'none'
  source                TEXT NOT NULL,              -- 'explicit' | 'heuristic' | 'inaction' | 'llm_judge'
  processed             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `projects` — UI-level saved scope filters

```sql
CREATE TABLE projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  team_id               UUID,
  name                  TEXT NOT NULL,
  scope_filter          JSONB NOT NULL DEFAULT '{"include":[],"exclude":[]}',
  domain_cluster_id     UUID,                       -- FK added after domain_clusters exists
  cross_lens_access     BOOLEAN NOT NULL DEFAULT FALSE, -- must be TRUE for allowCrossLens queries
  settings              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `domain_seeds` — Type/weight hints for known domain signals

```sql
CREATE TABLE domain_seeds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label                 TEXT NOT NULL UNIQUE,       -- 'coding', 'writing', 'trading', etc.
  signal_keywords       JSONB NOT NULL,             -- terms that suggest this domain
  preferred_types       JSONB NOT NULL,             -- type→weight hints
  is_system             BOOLEAN NOT NULL DEFAULT FALSE -- TRUE = shipped with app; FALSE = learned
);
```

### `domain_clusters` — Emergent clusters from scope tag co-occurrence

```sql
CREATE TABLE domain_clusters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  label                 TEXT NOT NULL,
  scope_tags            JSONB NOT NULL,             -- ['#python', '#algorithms']
  centroid_1536         VECTOR(1536),               -- NULL if user is local-only
  centroid_384          VECTOR(384),                -- NULL if no local model configured
  confidence            FLOAT NOT NULL DEFAULT 0.5,
  learning_count        INTEGER NOT NULL DEFAULT 0,
  last_recomputed       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `injection_audit` — Full injection decision log

```sql
CREATE TABLE injection_audit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users,
  conversation_id       UUID,
  learning_id           UUID REFERENCES learnings ON DELETE SET NULL,
  included              BOOLEAN NOT NULL,
  score                 FLOAT NOT NULL,
  reason                TEXT,
  exclude_reason        TEXT,
  tier_used             INTEGER NOT NULL,           -- 1 | 2 | 3
  tokens_used           INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `conductor_queue` — Background job queue

```sql
CREATE TABLE conductor_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  type                  TEXT NOT NULL,              -- 'signal_processing' | 'lm_judge' | 'compaction'
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'completed'|'failed'
  attempts              INTEGER NOT NULL DEFAULT 0,
  locked_at             TIMESTAMPTZ,               -- zombie: reset if locked > 10 min
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `conductor_proposals` — Pending confidence adjustments

```sql
CREATE TABLE conductor_proposals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  learning_id           UUID REFERENCES learnings ON DELETE CASCADE,
  type                  TEXT NOT NULL,              -- 'promote'|'demote'|'archive'|'merge'
  confidence_delta      FLOAT NOT NULL,
  rationale             TEXT NOT NULL,
  requires_approval     BOOLEAN NOT NULL DEFAULT TRUE,
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'expired'
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `api_tokens` — MCP Bearer tokens

```sql
CREATE TABLE api_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  hashed_token          TEXT NOT NULL UNIQUE,       -- bcrypt hash; plain token shown once at creation
  scopes                JSONB NOT NULL DEFAULT '[]',
  last_used_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Type Registry

TEXT values for the `type` column. Never an ENUM.

**Core types:** `invariant` | `pattern` | `decision` | `antipattern` | `golden_path` | `anchor`
**Writing types:** `character` | `setting` | `plot_thread` | `voice` | `world_rule`

New types are added by inserting new values — no migration required.

---

## Indexes

```sql
-- learnings
CREATE INDEX learnings_user_id_idx ON learnings(user_id);
CREATE INDEX learnings_team_id_idx ON learnings(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX learnings_confidence_idx ON learnings(confidence) WHERE confidence > 0.2;
CREATE INDEX learnings_type_idx ON learnings(type);

-- ANN indexes — separate per dimension (lists = 100 correct for ~10K rows)
-- See migration notes for scaling: lists ≈ sqrt(N); HNSW migration path available at >500K rows
CREATE INDEX embeddings_1536_ann_idx ON embeddings_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX embeddings_384_ann_idx  ON embeddings_384  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- scopes + feedback
CREATE INDEX learning_scopes_scope_idx      ON learning_scopes(scope);
CREATE INDEX learning_scopes_learning_idx   ON learning_scopes(learning_id);
CREATE INDEX feedback_user_unprocessed_idx  ON feedback(user_id, processed) WHERE processed = FALSE;

-- queue + audit
CREATE INDEX conductor_queue_pending_idx    ON conductor_queue(user_id, status) WHERE status = 'pending';
CREATE INDEX conductor_queue_locked_idx     ON conductor_queue(locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX injection_audit_user_time_idx  ON injection_audit(user_id, created_at DESC);
CREATE INDEX api_tokens_active_idx          ON api_tokens(hashed_token) WHERE revoked_at IS NULL;
```

---

## Invariants

1. No FK from `learnings` to `projects`. Learnings exist independently; projects are scope filters.
2. `confidence ≤ confidence_base` enforced by CHECK constraint on `learnings`.
3. `cooccurrence` primary key is ordered pair (`learning_a < learning_b`) — no duplicates.
4. `learning_links` has a self-link prevention CHECK.
5. Embeddings are in separate tables. No embedding column on `learnings`.
6. pgvector extension must be enabled before migration: `CREATE EXTENSION IF NOT EXISTS vector;`

## Error Handling

- Insert failures on constraint violations should surface typed errors from the Nebula layer
- Dedup (write-time) should not throw on near-duplicate detection — merge silently and log

## Testing Contract

- After Phase 1 migration: insert a learning, confirm confidence CHECK holds
- Insert two learnings with same `learning_a` and `learning_b` in cooccurrence — second insert should UPDATE count
- Confirm embeddings_1536 and embeddings_384 can each hold a learning_id without conflict
- `nebula-schema-guardian` checklist must pass fully

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| `project_learning_paths` FK to projects | `learning_scopes` tags; no FK to projects |
| Single `confidence` column | `confidence_base` + `confidence` split |
| Embedding column on learnings | Typed embedding tables |
| No `team_id` | Federation-ready from day one |
| Type as implied string | Type registry documented; TEXT enforced |
| Zombie queue with no recovery index | `conductor_queue_locked_idx` for recovery |
```

---

### 4c: docs/specs/PODIUM_INTERFACE_SPEC.md

```markdown
# Podium Interface Specification

**Phase:** 0 (pre-implementation) → implements in Phase 2a
**Status:** Locked
**Guardian:** `podium-injection-agent`

---

## Purpose

Define the complete contract for Podium — the cognitive scaffold that decides what context to inject into each LLM request. Podium reads from the Nebula (Layer 0) through `NebulaInterface` only. It writes injection audit entries. It does not write confidence scores.

## Non-Goals

- Does not implement confidence adjustment (Conductor's job)
- Does not implement feedback signal routing (Conductor's job)
- Does not define the embedding model or provider fallback (defined in NEBULA_SCHEMA_SPEC.md)
- Does not define the Shell/API surface

---

## Tiered Compilation

Context window size determines the injection tier:

| Tier | Context Window | Max Budget | Use Case |
|------|---------------|------------|----------|
| 1 | ≤ 16K tokens | 6% of window (960 max) | Haiku, Gemini Flash |
| 2 | 16K–64K tokens | 8% of window (5,120 max) | Sonnet, GPT-4o |
| 3 | > 64K tokens | 12% of window (12,288 max) | Opus, Gemini Pro |

Budget clamping: `Math.min(requestedBudget, tierConfig.maxBudget)` applied in ALL code paths including cache miss fallback.

---

## Scoring Formula

```
score = (semantic × 0.40) + (confidence × 0.25) + (typeWeight × 0.15) + (recency × 0.10) + (scopeMatch × 0.10)
```

Selection: sort by `score / tokenCount` (attention density — not raw score, not token maximization).

Quality gate: exclude items below threshold even with budget remaining.

### Type weights

Type weights are domain-aware. When `DomainSignal.primary` is null, all types use weight 1.0 (no domain boost, no domain exclusion). There is no `general` fallback type.

| Type | coding | writing | trading | null |
|------|--------|---------|---------|------|
| `invariant` | 1.0 | 1.0 | 1.0 | 1.0 |
| `anchor` | 1.0 | 1.0 | 1.0 | 1.0 |
| `pattern` | 0.9 | — | 0.9 | 1.0 |
| `decision` | 0.8 | — | 0.8 | 1.0 |
| `golden_path` | 0.7 | — | 0.7 | 1.0 |
| `antipattern` | 0.6 | — | 0.6 | 1.0 |
| `character` | — | 1.0 | — | 1.0 |
| `world_rule` | — | 1.0 | — | 1.0 |
| `plot_thread` | — | 0.9 | — | 1.0 |
| `voice` | — | 0.8 | — | 1.0 |
| `setting` | — | 0.7 | — | 1.0 |

Types not listed for a domain are weighted 0.2 (low but not zero — they can still inject if highly relevant).

### Intent weight profiles

| Intent | semantic | recency | confidence | typeWeight | scopeMatch |
|--------|---------|---------|-----------|-----------|-----------|
| `question` | 0.40 | 0.10 | 0.25 | 0.15 | 0.10 |
| `generation` | 0.40 | 0.10 | 0.25 | 0.15 | 0.10 |
| `analysis` | 0.50 | 0.05 | 0.20 | 0.15 | 0.10 |
| `debugging` | 0.30 | 0.35 | 0.15 | 0.10 | 0.10 |
| `discussion` | 0.35 | 0.10 | 0.25 | 0.15 | 0.15 |
| `continuation` | 0.30 | 0.40 | 0.15 | 0.05 | 0.10 |
| `greeting` | 0.20 | 0.10 | 0.30 | 0.20 | 0.20 |

For `debugging`: antipattern typeBoostMultiplier = 2.0, decision typeBoostMultiplier = 0.5.

---

## Decay Half-Lives

Podium reads the `confidence` column (already decayed by the nightly tick). It does not apply decay at query time — that would double-decay items.

| Type | Half-life | Floor | Notes |
|------|-----------|-------|-------|
| `invariant`, `anchor`, `character`, `world_rule` | ∞ | 1.0 | Never decay |
| `decision` | 365 days | 0.30 | Long-lived strategic choices |
| `pattern`, `voice` | 90 days | 0.15 | Behavioral; fades if unused |
| `plot_thread` | 90 days | 0.10 | Active story elements |
| `golden_path` | 30 days | 0.05 | Current best practices |
| `antipattern` | 14 days | 0.02 | Warnings fade; superseded |
| `setting` | 180 days | 0.10 | Stable but not permanent |

---

## Interface

See LAYER_CONTRACTS.md — `PodiumRequest`, `PodiumResult`, `InjectedLearning`.

---

## Invariants

1. Embeddings are pre-computed before injection. Podium never computes embeddings at query time.
2. Budget is clamped in ALL code paths: `Math.min(requested, tierConfig.maxBudget)`.
3. Quality threshold enforced: items below threshold are excluded even with budget remaining.
4. `DomainSignal.primary` is `string | null` — never the string `'general'`.
5. When `primary` is null, all types are scored with weight 1.0. No fallback domain logic.
6. Injection audit entries are written for EVERY item considered, included AND excluded.
7. Pinned items (`pinnedAt != null`) always inject if within budget. Muted items (`mutedAt != null`) never inject.
8. Selection metric is attention density (`score / tokenCount`), not raw score.

## Error Handling

- If no embedding available for query: fall back to scope + recency scoring only (no semantic component)
- If embedding table is empty: return empty injectedItems, tierUsed from context window, tokensUsed = 0
- If budget is zero after clamping: return empty context with audit entries explaining exclusion

## Testing Contract

- `getContext` with tier 1 model: verify tokensUsed ≤ 960
- `getContext` with domain null: verify no `'general'` in any type weight lookup
- `getContext` with muted learning: verify it is excluded with reason `'muted'`
- `getContext` with pinned learning: verify it is included unless over budget
- Audit log: for N candidates, audit must have exactly N entries (included + excluded)
- Budget clamping: requesting 10000 tokens on tier 1 must clamp to 960

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Cache miss path ignored tier limits | Budget clamping in all paths |
| `usageCount` not incremented on injection | Fire-and-forget UPDATE in Podium |
| No audit log for excluded items | All N candidates logged |
| Domain as binary tag (any overlap = 0.2) | Proportional scoring + null domain path |
| `'general'` as a domain fallback | `DomainSignal.primary` is `string | null` |
```

---

### 4d: docs/specs/CONDUCTOR_INTERFACE_SPEC.md

```markdown
# Conductor Interface Specification

**Phase:** 0 (pre-implementation) → implements in Phase 2b
**Status:** Locked
**Guardian:** `conductor-spec-agent`

---

## Purpose

Define the complete contract for the Conductor — the feedback loop that observes outcomes and proposes confidence adjustments. The Conductor reads and writes to the Nebula via `NebulaInterface`. It never directly modifies the Podium's selection logic.

## Non-Goals

- Does not define injection logic (Podium's job)
- Does not define MCP feedback submission surface (see Phase 3)
- Does not define the Shell inbox UI (see Phase 5)
- Does not implement the LLM judge in v2.0 (deferred to v2.1)

---

## Signal Policy (v2.0 Canonical)

| Signal Type | Auto-applied to `confidence_base` | Stored in `feedback` |
|-------------|-----------------------------------|----------------------|
| `explicit` (👍/👎) | **Yes — immediate** | Yes |
| `heuristic` (turn-pattern) | **No — soft prior only** | Yes, `source = 'heuristic'` |
| `inaction` (7-day silence) | **No — no confidence nudge** | Yes, `source = 'inaction'` |
| `end_of_session_judge` | **No — always queued as proposal** | Yes, `source = 'llm_judge'` |

This policy is **inviolable in v2.0**. Heuristic and inaction signals accumulate as a calibration dataset for v2.1 offline experimentation. No automatic confidence drift from unverified signals.

---

## Confidence Formula

```
confidence_base = (interaction × 0.3) + (verification × 0.4) + (consistency × 0.2) + (consistencyFactor × 0.1)
```

- `interaction`: signal frequency and strength (0–1)
- `verification`: `1.0` if human-verified, `0.5` if not
- `consistency`: stability across multiple feedback signals (0–1)
- `consistencyFactor`: how consistently this item has held up across feedback history (0–1). **This is NOT the time-based decay from `computeDecayedConfidence()`.** `confidence_base` is never modified by the decay tick.

Ceiling: `1.0` if verified, `0.7` if unverified.
Floor: pinned items are untouchable — Conductor skips them entirely.
Large delta rule: any change > `0.10` to `confidence_base` requires a `ConductorProposal` with `requiresHumanApproval = true`.

---

## End-of-Session Judge (v2.0 Opt-in)

- Disabled by default: `users.endOfSessionJudgeEnabled = FALSE`
- Sovereign/local tier: never enabled regardless of user setting
- When enabled: fires asynchronously after conversation ends, sends to a provider the user has already authorized
- Results always create `conductor_proposals` with `requiresHumanApproval = true`
- Never auto-applies

---

## Guardrails (Inviolable)

1. **Cannot hard-delete a learning** — can only propose `type: 'archive'`
2. **Cannot promote unverified items beyond `confidence_base` 0.7**
3. **Cannot adjust pinned items** — Conductor checks `pinnedAt != null` and skips
4. **All actions emit a `ConductorAuditEntry`** — the audit trail is never optional
5. **Large deltas require proposals** — `|delta| > 0.10` must create a proposal, never apply directly

---

## Zombie Recovery

Queue items stuck in `processing` for > 10 minutes are zombies. Recovery runs every 5 minutes:

```typescript
// Zombie recovery pattern — must be implemented in conductor/queue.ts
async function recoverZombies(db: DB): Promise<void> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000)
  await db
    .update(conductorQueue)
    .set({ status: 'pending', lockedAt: null })
    .where(
      and(
        eq(conductorQueue.status, 'processing'),
        lt(conductorQueue.lockedAt, threshold)
      )
    )
}
```

Zombie recovery must be scheduled via:
1. Vercel Cron at `/api/cron/zombie-recovery` (primary for Vercel deployment)
2. `chorumd` internal scheduler (for local installs)

---

## Interface

See LAYER_CONTRACTS.md — `ConductorSignal`, `ConductorProposal`, `BinaryStarInterface`.

---

## Invariants

1. Explicit signals auto-apply immediately to `confidence_base`.
2. Heuristic and inaction signals are stored in `feedback` table — zero automatic `confidence_base` change.
3. LLM judge results always create proposals with `requiresHumanApproval = true`.
4. End-of-session judge checks `endOfSessionJudgeEnabled` before firing — default false.
5. Every Conductor action writes a `ConductorAuditEntry`.
6. Pinned items: Conductor skips adjustment entirely.
7. Delta > 0.10: proposal required, never direct application.
8. Unverified items: `confidence_base` ceiling = 0.7.

## Error Handling

- Signal processing failures: log and continue — one bad signal does not stop the queue
- LLM judge failures (API error, timeout): mark queue item failed, increment attempts; do not retry more than 3 times
- Zombie recovery must not throw — run silently, log count of recovered items

## Testing Contract

- Explicit positive signal: `confidence_base` increases immediately
- Heuristic signal: `confidence_base` unchanged; feedback row created with `source = 'heuristic'`
- Inaction signal: `confidence_base` unchanged; feedback row created with `source = 'inaction'`
- Delta > 0.10: proposal created, `confidence_base` unchanged until approved
- Pinned item: signal submitted → no change to any confidence column
- Zombie recovery: insert item with `status = 'processing'` and `locked_at = 15 min ago` → after recovery run, `status = 'pending'`

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| `usageCount` never incremented | Fire-and-forget UPDATE in injector |
| Zombie queue: no recovery mechanism | `recoverZombies()` on 5-min schedule |
| No feedback loop closed | Conductor observes outcome via feedback table |
| `decay_factor` in confidence formula (naming confusion) | `consistencyFactor` — not temporal decay |
| `golden_path` never extracted organically | Added to extraction prompt in Phase 2 |
```

---

### 4e: docs/specs/DOMAIN_SEEDS_SPEC.md

```markdown
# Domain Seeds Specification

**Phase:** 0 (pre-implementation) → inserts in Phase 3
**Status:** Locked
**Guardian:** `nebula-schema-guardian`, `podium-injection-agent`

---

## Purpose

Define the initial `domain_seeds` data and the rules governing how the analyzer produces scope tags, how domain clusters emerge, and why there is no `general` fallback category.

## Non-Goals

- Does not define the LLM extraction prompt (see Phase 2 Conductor spec)
- Does not define the domain cluster recompute algorithm (Phase 3 background job)
- Does not define UI for domain management (Phase 5)

---

## Domain Design Principle

Domain is **emergent, not assigned**. Scope tags are the atomic unit:

```
scope tags (#python, #trading, #worldbuilding)
    ↓ co-occurrence over time
domain clusters (emergent, user-specific labels)
    ↓ hints from
domain seeds (system-shipped, LLM-readable defaults)
```

**The analyzer produces scope tags — never a domain label directly.**
**There is no `general` fallback.** If domain is unclear: tag with the most specific terms available. Retrieval falls back to embedding-only scoring (still correct; no domain boost).

**Accepted tradeoff:** Cold-start users with no scope tags get no domain-match bonus. Embedding similarity still returns correct results. Domain boost activates as tags accumulate.

---

## Initial Domain Seeds

Insert these rows into `domain_seeds` with `is_system = TRUE` in Phase 3:

### Coding

```json
{
  "label": "coding",
  "signal_keywords": [
    "function", "class", "import", "const", "async", "await",
    "TypeScript", "Python", "React", "Next.js", "API", "database",
    "refactor", "bug", "test", "deploy", "build", "error"
  ],
  "preferred_types": {
    "invariant": 1.0,
    "anchor": 1.0,
    "pattern": 0.9,
    "decision": 0.8,
    "golden_path": 0.7,
    "antipattern": 0.6
  },
  "is_system": true
}
```

### Writing

```json
{
  "label": "writing",
  "signal_keywords": [
    "character", "plot", "scene", "chapter", "story", "narrative",
    "protagonist", "dialogue", "world", "setting", "voice",
    "fiction", "draft", "edit", "prose"
  ],
  "preferred_types": {
    "character": 1.0,
    "world_rule": 1.0,
    "anchor": 1.0,
    "plot_thread": 0.9,
    "voice": 0.8,
    "setting": 0.7
  },
  "is_system": true
}
```

### Trading

```json
{
  "label": "trading",
  "signal_keywords": [
    "option", "strike", "expiry", "delta", "gamma", "theta",
    "position", "trade", "entry", "exit", "risk", "P&L",
    "backtesting", "strategy", "portfolio", "volatility"
  ],
  "preferred_types": {
    "invariant": 1.0,
    "anchor": 1.0,
    "decision": 0.9,
    "pattern": 0.8,
    "antipattern": 0.7,
    "golden_path": 0.6
  },
  "is_system": true
}
```

### Research

```json
{
  "label": "research",
  "signal_keywords": [
    "paper", "study", "hypothesis", "experiment", "data", "analysis",
    "citation", "methodology", "finding", "conclusion", "abstract",
    "literature", "review"
  ],
  "preferred_types": {
    "decision": 1.0,
    "invariant": 0.9,
    "pattern": 0.8,
    "golden_path": 0.7,
    "anchor": 1.0
  },
  "is_system": true
}
```

---

## How the Analyzer Produces Scope Tags

The extraction LLM prompt instructs the model to:
1. Identify the primary topics of the conversation turn
2. Produce lowercase, `#`-prefixed scope tags (e.g., `#python`, `#authentication`, `#worldbuilding`)
3. Use the most specific terms available — prefer `#react-hooks` over `#react` if the conversation is specifically about hooks
4. Produce 1–5 scope tags per extracted learning
5. Never produce `#general` as a scope tag — this is a forbidden term

Example extraction:
```
Conversation: "We decided to use Zod for validation in this Next.js API route because..."
Scope tags produced: ["#zod", "#validation", "#nextjs", "#typescript"]
Domain signal: primary = "coding" (matched against coding seed keywords)
```

---

## Domain Cluster Recompute (Phase 3 Background Job)

Clusters are NOT recomputed at conversation time. They are recomputed as a Phase 3 background job:
1. Group `learning_scopes` by user, find frequently co-occurring scope tag pairs
2. Build cluster from tags with co-occurrence count > threshold (start: 5)
3. Compute centroid by averaging embeddings of all learnings in the cluster
4. Upsert into `domain_clusters`
5. Associate projects with clusters based on scope_filter overlap

---

## Invariants

1. `domain_seeds` labels are unique — no duplicate domain names.
2. Analyzer produces scope tags, never domain labels.
3. `#general` is a forbidden scope tag — reject at validation layer.
4. `DomainSignal.primary` in Podium is the `label` from the best-matching seed, or `null`.
5. New seeds can be inserted dynamically (user-defined domains) — `is_system = FALSE`.

## Testing Contract

- Analyzer output: extract from a coding-themed turn → scope tags include at least one coding keyword
- Analyzer output: extract from ambiguous turn → scope tags present but may not match any seed; `DomainSignal.primary = null`
- `#general` in scope tags → validation rejects it
- Domain seeds insert: 4 system seeds present after Phase 3 seed init

## What v1 Got Wrong

| v1 Mistake | v2 Fix |
|-----------|--------|
| Domain was a tag (string column on projects) | Domain is emergent from scope tag clustering |
| No domain-aware extraction | `domain_seeds` provide LLM hints |
| Binary domain scoring | Proportional + null domain path |
| No golden_path extraction | Added to extraction prompt in Phase 2 |
```

---

## Step 5: Stub Files

Create these files with the exact content shown. No logic. TypeScript must compile.

### src/app/api/mcp/route.ts

```typescript
// src/app/api/mcp/route.ts
// MCP endpoint — Phase 3 implementation
// Do not add logic here until Phase 3 spec is approved.
export async function POST(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Not implemented — Phase 3' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### src/lib/nebula/index.ts

```typescript
// src/lib/nebula/index.ts
// Layer 0 — Zettelkasten / Nebula
// Phase 1 implementation. Do not add logic here until Phase 1 spec is approved.
export type { NebulaInterface } from './interface'
```

### src/lib/nebula/interface.ts

```typescript
// src/lib/nebula/interface.ts
// This file will be populated in Phase 1. Stub only.
// Full interface defined in docs/specs/LAYER_CONTRACTS.md

export interface NebulaInterface {
  // Phase 1 implements this interface.
  // See docs/specs/LAYER_CONTRACTS.md for full contract.
  readonly _phase: 1
}
```

### src/lib/core/index.ts

```typescript
// src/lib/core/index.ts
// Layer 1 — Binary Star Core (Podium + Conductor)
// Phase 2 implementation.
export type { BinaryStarInterface } from './interface'
```

### src/lib/core/interface.ts

```typescript
// src/lib/core/interface.ts
// Phase 2 implements this interface.
// See docs/specs/LAYER_CONTRACTS.md for full contract.

export interface BinaryStarInterface {
  readonly _phase: 2
}
```

---

## Step 6: Guardian Validation

Run both guardian skills against the Phase 0 output before declaring Phase 0 complete.

### 6.1 chorum-layer-guardian

Load `skills/chorum-layer-guardian/SKILL.md` and run its compliance checklist against the Phase 0 scaffold.

**Expected result:** PASS. The scaffold has no business logic anywhere. All `src/lib/` directories are stubs. Import direction is correct (no layer violations are possible with stubs only).

**If it fails:** The only Phase 0 layer violation would be an import from `src/app/` into `src/lib/`. Fix before proceeding.

### 6.2 nebula-schema-guardian

Load `skills/nebula-schema-guardian/SKILL.md` and run its compliance checklist against `src/db/schema.ts`.

**Expected result:** PASS — schema.ts is empty (`export {}`), which is correct. The guardian confirms no forbidden patterns exist.

**Important:** The guardian is establishing a baseline here. A passing empty schema is correct. Phase 1 will populate it and guardian will run again against the actual tables.

### 6.3 Build verification

```bash
npx next build
```

Must complete with zero TypeScript errors. Zero warnings about `any`. All import paths must resolve.

---

## Completion Criteria

Phase 0 is complete when ALL of the following are true. Map directly to CHECKLIST_2.0.md Phase 0 → Phase 1 Transition:

```
□ chorum-v2/ directory exists at c:/Users/dmill/Documents/GitHub/ChorumAI/chorum-v2/
□ npx next build passes with zero errors
□ TypeScript strict mode: no @ts-ignore, no implicit 'any'
□ Auth wired: getServerSession(authOptions) returns session.user.id
□ Drizzle connected: db query to Supabase executes without error
□ All 5 spec documents exist in docs/specs/ with required 7 sections each
□ All layer directories exist: nebula/, core/podium/, core/conductor/, customization/, agents/
□ All stub files in place with correct content
□ chorum-layer-guardian: PASS on empty scaffold
□ nebula-schema-guardian: PASS on empty schema.ts
□ CHANGELOG.md updated with Phase 0 completion
□ .env.local.example committed (real values in .env.local, gitignored)
□ skills/ directory in place (all 5 skills)
□ Human checkpoint: open localhost:3000, confirm Next.js default page renders
```

No TODOs. No "implement in next phase" comments in non-stub files. No business logic anywhere in Phase 0 output.

---

## Handoff Notes

**Assigned model: Codex 5.3**

Phase 0 is a code generation task. The five spec documents are TypeScript interface-first — Codex's primary strength. The scaffold setup is deterministic from the commands in Step 1. There is nothing ambiguous to reason about here; everything is specified precisely. Execute step by step, run the guardian checks, confirm the build passes.

**Gemini 3.1** is reserved for Phase 2a (Podium scoring algorithms) where analytical reasoning about attention economy, retrieval quality, and weight calibration is the primary challenge — not file generation.

If you encounter a gap not covered by this spec: **stop, flag it, do not interpolate**. The right answer is to surface the gap before writing code around it.
