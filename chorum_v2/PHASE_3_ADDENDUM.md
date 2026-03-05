# Phase 3 Addendum: Active Memory Loop — Closing the Extraction Gap

**Version:** 1.0
**Date:** 2026-02-27
**Status:** Ready for execution (after PHASE_3_SPEC.md base is complete)
**Depends on:** PHASE_3_SPEC.md v3.0 (4 core tools, auth, ChorumClient)
**Guardian gates:** `mcp-contract-agent` (re-run after addendum)

---

## The Problem

The 4 core MCP tools (`read_nebula`, `get_context`, `inject_learning`, `submit_feedback`) are a passive CRUD API. They sit there waiting for the client LLM to call them. But MCP client LLMs (Claude Desktop, Cursor, Windsurf) don't inherently know *when* or *why* to call these tools.

**v1 failure mode (confirmed by dogfooding):** The MCP server was connected. Tools were available. Zero learnings were captured. Zero projects were created. The client LLM never called the tools because nothing told it to.

**This addendum adds:**
1. MCP tool descriptions that instruct the client LLM on expected workflow
2. Two new MCP tools: `start_session` and `end_session` for conversation tracking
3. One new MCP tool: `extract_learnings` for server-side extraction with scope auto-detection
4. MCP server prompts/resources that define the memory system contract
5. Auto-scope detection fallback in `inject_learning`
6. Project auto-association from scope tags

---

## Root Cause Analysis

MCP servers expose three things to client LLMs:
1. **Tools** — functions the LLM can call (we have 4)
2. **Tool descriptions** — natural language explaining when/why to call each tool (we have none)
3. **Prompts/Resources** — system-level instructions and context the client loads (we have none)

Without (2) and (3), the client LLM treats Chorum tools the same as any other random MCP tool — available but not prioritized. The LLM has no mental model of "I am a memory-augmented assistant" and no instructions to call `get_context` at conversation start or `inject_learning` when the user teaches it something.

---

## Deliverable 1: MCP Tool Descriptions

Every MCP tool must include a `description` field in the tool manifest that instructs the client LLM. These are not documentation — they are behavioral instructions.

### Updated tool descriptions for `/api/mcp` manifest

Add a `tools/list` method response (or equivalent MCP manifest) to `route.ts`:

```typescript
// Tool manifest — returned by tools/list or server capabilities
export const MCP_TOOL_MANIFEST = [
  {
    name: 'start_session',
    description: `CALL THIS AT THE START OF EVERY CONVERSATION. Registers a new conversation session with Chorum and returns any relevant context from your memory graph. This is how you remember things about the user across conversations. If you skip this, you will have no memory of past interactions.`,
    inputSchema: StartSessionParamsSchema,
  },
  {
    name: 'get_context',
    description: `Retrieves relevant learnings from your memory graph for a specific query. Call this when the user asks a question and you want to check if you've learned anything relevant before. The returned context should be incorporated into your response — it contains verified facts, patterns, and decisions from past conversations.`,
    inputSchema: GetContextParamsSchema,
  },
  {
    name: 'inject_learning',
    description: `IMPORTANT: Call this whenever the user teaches you something new, corrects you, states a preference, makes a decision, or establishes a rule. This is how you build long-term memory. Examples of when to call this:
- User says "I prefer tabs over spaces" → inject as 'decision' with scope '#coding'
- User says "My character Alice is a detective" → inject as 'character' with scope '#writing'
- User corrects a mistake → inject the correction as 'invariant'
- User shares a workflow → inject as 'golden_path'
If you don't call this, you will forget everything when the conversation ends.`,
    inputSchema: InjectLearningParamsSchema,
  },
  {
    name: 'submit_feedback',
    description: `Call this when the user reacts positively or negatively to information you retrieved from memory. Thumbs up = the memory was helpful. Thumbs down = the memory was wrong or unhelpful. This feedback improves which memories surface in future conversations.`,
    inputSchema: SubmitFeedbackParamsSchema,
  },
  {
    name: 'extract_learnings',
    description: `Call this at the END of a conversation (or periodically during long conversations) to automatically extract learnings from the conversation history. This analyzes what was discussed and identifies facts, patterns, decisions, and preferences worth remembering. You should call this even if you already called inject_learning for specific items — this catches things you might have missed.`,
    inputSchema: ExtractLearningsParamsSchema,
  },
  {
    name: 'end_session',
    description: `CALL THIS WHEN THE CONVERSATION ENDS. Closes the session, triggers any pending extraction, and updates session metadata. If the user says goodbye, thanks you, or the conversation naturally concludes, call this.`,
    inputSchema: EndSessionParamsSchema,
  },
  {
    name: 'read_nebula',
    description: `Browse the user's knowledge graph directly. Use this when the user asks "what do you know about X" or "show me my learnings" or wants to review/manage their stored knowledge.`,
    inputSchema: ReadNebulaParamsSchema,
  },
]
```

---

## Deliverable 2: Conversation Tracking — `start_session` and `end_session`

### New table: `conversations`

Migration `drizzle/0004_conversations.sql`:

```sql
-- Phase 3 Addendum: Conversation tracking for the active memory loop

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,  -- FK to auth.users enforced in app layer
  session_id      TEXT,           -- external session ID from MCP client (if provided)
  scope_tags      JSONB NOT NULL DEFAULT '[]',   -- auto-detected + user-specified
  project_id      UUID REFERENCES projects,       -- auto-associated from scope overlap
  message_count   INTEGER NOT NULL DEFAULT 0,
  learnings_extracted INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'     -- client info, model used, etc.
);

CREATE INDEX conversations_user_id_idx ON conversations(user_id);
CREATE INDEX conversations_started_at_idx ON conversations(user_id, started_at DESC);
CREATE INDEX conversations_project_id_idx ON conversations(project_id);
```

### `start_session` tool

```typescript
// New params schema
export const StartSessionParamsSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().optional(),        // external session ID
  initialQuery: z.string().optional(),     // first message — used for scope detection + context prefetch
  scopeHints: z.array(z.string()).optional(), // explicit scope tags from client
  contextWindowSize: z.number().int().default(16000),
  metadata: z.record(z.unknown()).optional(),
})

export type StartSessionParams = z.infer<typeof StartSessionParamsSchema>

export interface StartSessionResult {
  conversationId: string
  prefetchedContext: string           // compiled context from get_context (if initialQuery provided)
  detectedScopes: string[]           // auto-detected from initialQuery
  associatedProject: string | null   // project name if scope overlap found
  injectedItems: InjectedLearning[]  // what was injected in prefetch
}
```

### Handler: `handleStartSession`

```typescript
export async function handleStartSession(
  params: StartSessionParams,
  auth: AuthContext,
): Promise<StartSessionResult> {
  const nebula = getNebula()
  const binaryStar = getBinaryStar()

  // 1. Auto-detect scopes from initial query (if provided)
  let detectedScopes: string[] = params.scopeHints ?? []
  if (params.initialQuery && detectedScopes.length === 0) {
    detectedScopes = await detectScopes(params.initialQuery, auth.userId)
  }

  // 2. Find matching project by scope overlap
  const associatedProject = await findProjectByScopes(detectedScopes, auth.userId)

  // 3. Create conversation record
  const conversationId = await createConversation({
    userId: auth.userId,
    sessionId: params.sessionId,
    scopeTags: detectedScopes,
    projectId: associatedProject?.id ?? null,
    metadata: params.metadata ?? {},
  })

  // 4. Prefetch context if initial query provided
  let prefetchedContext = ''
  let injectedItems: InjectedLearning[] = []
  if (params.initialQuery) {
    // Compute embedding for initial query
    const embedding = await computeEmbedding(params.initialQuery)

    const scopeFilter = associatedProject?.scopeFilter ?? {
      include: detectedScopes,
      exclude: [],
      boost: [],
    }

    const result = await binaryStar.getContext({
      userId: auth.userId,
      conversationId,
      queryText: params.initialQuery,
      queryEmbedding: embedding,
      scopeFilter,
      domainSignal: { primary: null, confidence: 0, detected: detectedScopes },
      intent: 'question',
      contextWindowSize: params.contextWindowSize,
    })

    prefetchedContext = result.compiledContext
    injectedItems = result.injectedItems
  }

  return {
    conversationId,
    prefetchedContext,
    detectedScopes,
    associatedProject: associatedProject?.name ?? null,
    injectedItems,
  }
}
```

### `end_session` tool

```typescript
export const EndSessionParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),    // if provided, triggers server-side extraction
})

export type EndSessionParams = z.infer<typeof EndSessionParamsSchema>

export interface EndSessionResult {
  extractedLearnings: number
  sessionDuration: number   // seconds
  closed: true
}
```

### Handler: `handleEndSession`

```typescript
export async function handleEndSession(
  params: EndSessionParams,
  auth: AuthContext,
): Promise<EndSessionResult> {
  // 1. If conversation history provided, run server-side extraction
  let extractedCount = 0
  if (params.conversationHistory && params.conversationHistory.length > 0) {
    const extracted = await extractLearningsFromHistory(
      params.userId,
      params.conversationId,
      params.conversationHistory,
    )
    extractedCount = extracted.length
  }

  // 2. Close conversation record
  const conversation = await closeConversation(params.conversationId, extractedCount)
  const duration = conversation
    ? Math.floor((Date.now() - conversation.startedAt.getTime()) / 1000)
    : 0

  // 3. Fire end-of-session judge if enabled (Phase 2 stub, wired here)
  // This is async fire-and-forget — don't block the response
  const { maybeFireSessionJudge } = await import('@/lib/core/conductor/judge')
  maybeFireSessionJudge(params.userId, params.conversationId, []).catch(() => {})

  return {
    extractedLearnings: extractedCount,
    sessionDuration: duration,
    closed: true,
  }
}
```

---

## Deliverable 3: `extract_learnings` Tool — Server-Side Extraction

This is the critical missing piece. The client LLM can call this with conversation history, and the server extracts learnings with proper scope tags.

```typescript
export const ExtractLearningsParamsSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  scopeHints: z.array(z.string()).optional(),
})

export type ExtractLearningsParams = z.infer<typeof ExtractLearningsParamsSchema>

export interface ExtractLearningsResult {
  extracted: Array<{
    content: string
    type: string
    scopes: string[]
    confidenceBase: number
    proposalCreated: boolean
  }>
  totalExtracted: number
}
```

### Handler: `handleExtractLearnings`

```typescript
export async function handleExtractLearnings(
  params: ExtractLearningsParams,
  auth: AuthContext,
): Promise<ExtractLearningsResult> {
  const extracted = await extractLearningsFromHistory(
    params.userId,
    params.conversationId,
    params.conversationHistory,
    params.scopeHints,
  )

  return {
    extracted: extracted.map((e) => ({
      content: e.content,
      type: e.type,
      scopes: e.scopes,
      confidenceBase: e.confidenceBase,
      proposalCreated: e.proposalCreated,
    })),
    totalExtracted: extracted.length,
  }
}
```

### Core extraction function

```typescript
// src/lib/customization/extraction.ts
// Server-side learning extraction from conversation history.
// Uses the cheapest available provider the user has authorized.
// Extraction results go through inject_learning (HITL rules apply).

import { handleInjectLearning } from './handlers'
import type { AuthContext } from './types'
import type { LearningType } from '@/lib/nebula/types'

interface ExtractionCandidate {
  content: string
  type: LearningType
  scopes: string[]
  confidenceBase: number
  proposalCreated: boolean
}

const EXTRACTION_PROMPT = `Analyze the following conversation and extract discrete learnings worth remembering for future conversations with this user. For each learning, provide:

1. content: A clear, standalone statement of the learning (not a quote — rephrase for clarity)
2. type: One of: invariant, pattern, decision, antipattern, golden_path, anchor, character, setting, plot_thread, voice, world_rule
3. scopes: Array of scope tags (e.g., "#python", "#trading", "#fiction") — be specific, never use "#general"

Types guide:
- invariant: A fact that is always true ("I use PostgreSQL for all projects")
- pattern: A recurring approach ("I prefer functional style over OOP")
- decision: A specific choice made ("We decided to use JWT for auth")
- antipattern: Something to avoid ("Never use SELECT * in production")
- golden_path: A preferred workflow ("Run tests before every commit")
- anchor: A key reference point ("My main project is called Chorum")
- character/setting/plot_thread/voice/world_rule: For creative writing contexts

Rules:
- Only extract things the USER stated, decided, or confirmed — not things the assistant suggested
- Skip greetings, small talk, and meta-conversation
- Each learning must be independently understandable without conversation context
- Prefer specificity over generality
- If nothing worth extracting exists, return an empty array

Return JSON array: [{ "content": "...", "type": "...", "scopes": ["..."] }]`

export async function extractLearningsFromHistory(
  userId: string,
  conversationId: string,
  history: Array<{ role: string; content: string }>,
  scopeHints?: string[],
): Promise<ExtractionCandidate[]> {
  if (history.length === 0) return []

  // Format conversation for extraction
  const formatted = history
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  // Call cheapest available provider for extraction
  // Phase 4 will route this through the provider system.
  // For Phase 3: use direct API call to the configured extraction provider.
  const candidates = await callExtractionProvider(EXTRACTION_PROMPT, formatted)
  if (!candidates || candidates.length === 0) return []

  // Inject each candidate through the standard HITL path
  const results: ExtractionCandidate[] = []
  const auth: AuthContext = { userId, scopes: ['write:nebula'] }

  for (const candidate of candidates) {
    // Merge scope hints with extracted scopes
    const mergedScopes = [...new Set([
      ...(candidate.scopes ?? []),
      ...(scopeHints ?? []),
    ])]

    // Skip if no scopes detected (can't store unscoped learnings)
    if (mergedScopes.length === 0) continue

    try {
      const result = await handleInjectLearning({
        userId,
        content: candidate.content,
        type: candidate.type as LearningType,
        scopes: mergedScopes,
        extractionMethod: 'auto',  // auto = goes through HITL proposal
      }, auth)

      results.push({
        content: candidate.content,
        type: candidate.type,
        scopes: mergedScopes,
        confidenceBase: 0.3,  // auto extraction = low confidence
        proposalCreated: result.proposalCreated,
      })
    } catch {
      // Skip failed extractions — don't break the loop
      continue
    }
  }

  return results
}

/**
 * Call the extraction provider.
 * Phase 3: stub that returns parsed JSON from a provider call.
 * Phase 4: routed through src/lib/providers/ with user's configured provider.
 */
async function callExtractionProvider(
  systemPrompt: string,
  conversationText: string,
): Promise<Array<{ content: string; type: string; scopes: string[] }>> {
  // TODO Phase 4: Route through provider system.
  // For Phase 3: this must be implemented with a direct API call.
  // The provider should be the cheapest one the user has already authorized.
  //
  // Minimum viable implementation for Phase 3:
  // - Check env for OPENAI_API_KEY or GOOGLE_AI_KEY
  // - Call with the extraction prompt
  // - Parse JSON response
  // - Return candidates
  //
  // Placeholder — Codex must implement the actual API call.
  console.warn('[extraction] callExtractionProvider not yet wired to a provider')
  return []
}
```

---

## Deliverable 4: Auto-Scope Detection

When `inject_learning` is called without explicit scopes (or when `start_session` needs scope detection), fall back to keyword-based detection using `domain_seeds`.

```typescript
// src/lib/customization/scope-detection.ts
// Auto-detect scope tags from text content using domain_seeds signal keywords.
// This is the "analyzer" referenced in the Phase Architecture doc.

import { db } from '@/db'
import { domainSeeds, domainClusters } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Detect scope tags from text content.
 * Uses domain_seeds signal keywords for keyword matching.
 * Returns scope tags formatted as '#label' (e.g., '#coding', '#python').
 */
export async function detectScopes(text: string, userId: string): Promise<string[]> {
  const seeds = await db.select().from(domainSeeds)
  const lower = text.toLowerCase()
  const detected: string[] = []

  for (const seed of seeds) {
    const keywords = seed.signalKeywords as string[]
    const matchCount = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length
    // Require at least 2 keyword matches to claim a scope (reduces false positives)
    if (matchCount >= 2) {
      detected.push(`#${seed.label}`)
    }
  }

  // Also check user's existing clusters for more specific scope tags
  const clusters = await db
    .select()
    .from(domainClusters)
    .where(eq(domainClusters.userId, userId))

  for (const cluster of clusters) {
    const tags = cluster.scopeTags as string[]
    const matchCount = tags.filter((tag) => lower.includes(tag.replace('#', '').toLowerCase())).length
    if (matchCount >= 1) {
      detected.push(...tags.filter((tag) => !detected.includes(tag)))
    }
  }

  return [...new Set(detected)]
}
```

---

## Deliverable 5: Project Auto-Association

When a session starts with detected scopes, find the best-matching project by scope overlap.

```typescript
// src/lib/customization/project-association.ts
// Auto-associate conversations with projects based on scope tag overlap.

import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface ProjectMatch {
  id: string
  name: string
  scopeFilter: { include: string[]; exclude: string[]; boost: string[] }
  overlapScore: number
}

/**
 * Find the best-matching project for a set of scope tags.
 * Returns the project with highest scope overlap, or null if no match.
 * Minimum 1 overlapping scope tag required for a match.
 */
export async function findProjectByScopes(
  scopes: string[],
  userId: string,
): Promise<ProjectMatch | null> {
  if (scopes.length === 0) return null

  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))

  let bestMatch: ProjectMatch | null = null
  let bestScore = 0

  for (const project of userProjects) {
    const filter = project.scopeFilter as { include: string[]; exclude: string[] }
    const includeScopes = filter.include ?? []

    // Count overlapping scopes
    const overlap = scopes.filter((s) => includeScopes.includes(s)).length
    if (overlap > bestScore) {
      bestScore = overlap
      bestMatch = {
        id: project.id,
        name: project.name,
        scopeFilter: { ...filter, boost: [] },
        overlapScore: overlap / Math.max(includeScopes.length, 1),
      }
    }
  }

  // Require at least 1 overlapping scope
  return bestScore >= 1 ? bestMatch : null
}
```

---

## Deliverable 6: MCP Server Prompts Resource

MCP servers can expose **prompts** and **resources** that client LLMs load as system context. This is how the client knows it's a memory-augmented assistant.

Add to `route.ts` — the MCP `prompts/list` and `resources/list` responses:

```typescript
export const MCP_SYSTEM_PROMPT = {
  name: 'chorum-memory-system',
  description: 'System instructions for Chorum memory-augmented conversations',
  messages: [
    {
      role: 'system',
      content: {
        type: 'text',
        text: `You are connected to Chorum, a persistent memory system. You have access to a knowledge graph that remembers things across conversations.

CRITICAL WORKFLOW — follow this every conversation:

1. START: Call 'start_session' at the beginning of every conversation. This loads relevant memories and registers the session. Include the user's first message as 'initialQuery' to get relevant context immediately.

2. DURING: When the user teaches you something, states a preference, makes a decision, or corrects you:
   - Call 'inject_learning' immediately with the learning
   - Choose the right type (invariant, pattern, decision, etc.)
   - Tag with specific scopes (e.g., #python, #trading, #fiction)

3. CONTEXT: When you need to recall information, call 'get_context' with the current query. Incorporate returned memories into your response naturally — don't say "according to my memory" unless asked.

4. FEEDBACK: When the user reacts positively or negatively to recalled information, call 'submit_feedback' so the system can improve.

5. END: Call 'end_session' when the conversation concludes. Include the conversation history so the system can extract any learnings you might have missed.

You are NOT just a chatbot — you are a learning system. Every conversation should leave you smarter for the next one.`,
      },
    },
  ],
}
```

---

## Deliverable 7: Amend `inject_learning` — Scope Auto-Detection Fallback

Update `handleInjectLearning` in `handlers.ts` to auto-detect scopes when none are provided:

```typescript
// In handleInjectLearning, before creating the learning:

// Auto-detect scopes if none provided
let scopes = params.scopes
if (!scopes || scopes.length === 0) {
  const { detectScopes } = await import('./scope-detection')
  scopes = await detectScopes(params.content, params.userId)
}

// If still no scopes after auto-detection, use conversation scopes as fallback
if (scopes.length === 0 && params.conversationId) {
  const conversation = await getConversation(params.conversationId)
  scopes = (conversation?.scopeTags as string[]) ?? []
}

// Last resort: extract most specific terms from content as ad-hoc scope tags
if (scopes.length === 0) {
  // Don't store unscoped learnings — they pollute every query
  // Instead, tag with content-derived terms
  scopes = extractAdHocScopes(params.content)
}
```

This also requires amending `InjectLearningParamsSchema` to make scopes optional:

```typescript
// Change from:
scopes: z.array(z.string().min(1)).min(1),
// To:
scopes: z.array(z.string().min(1)).default([]),
```

---

## Updated Tool Count

After this addendum, the MCP surface has **7 tools** (not 4):

| Tool | Scope | Trigger |
|------|-------|---------|
| `start_session` | `read:nebula` | Start of every conversation |
| `get_context` | `read:nebula` | Mid-conversation context retrieval |
| `inject_learning` | `write:nebula` | User teaches something / states preference |
| `submit_feedback` | `write:feedback` | User reacts to recalled memory |
| `extract_learnings` | `write:nebula` | End of conversation / periodic |
| `end_session` | `write:feedback` | End of conversation |
| `read_nebula` | `read:nebula` | User asks to browse their knowledge |

---

## Updated TOOL_SCOPES

```typescript
export const TOOL_SCOPES: Record<string, TokenScope> = {
  start_session:     'read:nebula',
  get_context:       'read:nebula',
  read_nebula:       'read:nebula',
  inject_learning:   'write:nebula',
  extract_learnings: 'write:nebula',
  submit_feedback:   'write:feedback',
  end_session:       'write:feedback',
}
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `drizzle/0004_conversations.sql` | Conversations table |
| `src/db/schema.ts` amendment | Add `conversations` table definition |
| `src/lib/customization/extraction.ts` | Server-side learning extraction from conversation history |
| `src/lib/customization/scope-detection.ts` | Auto-detect scope tags from text using domain_seeds |
| `src/lib/customization/project-association.ts` | Auto-associate conversations with projects by scope overlap |
| `src/lib/customization/sessions.ts` | Conversation CRUD (create, close, get) |
| `src/lib/customization/handlers.ts` | Amended: 3 new handlers + inject_learning scope fallback |
| `src/lib/customization/types.ts` | Amended: 3 new param/result schemas |
| `src/app/api/mcp/route.ts` | Amended: 3 new tool routes + manifest + prompts |
| `src/lib/customization/index.ts` | Amended: new exports |

---

## Implementation Order (relative to base PHASE_3_SPEC.md)

Execute AFTER the base spec is complete:

1. `drizzle/0004_conversations.sql` + schema amendment
2. `sessions.ts` — conversation CRUD
3. `scope-detection.ts` — auto-scope from domain_seeds
4. `project-association.ts` — auto-project from scope overlap
5. `extraction.ts` — server-side extraction (stub provider call for Phase 3)
6. Amend `types.ts` — add 3 new schemas
7. Amend `handlers.ts` — add 3 new handlers + inject_learning scope fallback
8. Amend `route.ts` — add 3 new tool routes + manifest + prompts resource
9. Amend `index.ts` — new exports
10. Tests for sessions, scope detection, project association, extraction

---

## Test Contract (Addendum)

### Session tests (`src/__tests__/customization/sessions.test.ts`)

| Test | Assertion |
|------|-----------|
| `start_session` with initialQuery → returns prefetched context | `prefetchedContext` non-empty when learnings exist |
| `start_session` with scope hints → scopes carried through | `detectedScopes` includes hints |
| `start_session` detects scopes from query text | "Python function" → `#coding` detected |
| `start_session` auto-associates project | Matching project found by scope overlap |
| `end_session` closes conversation record | `ended_at` set |
| `end_session` with history → triggers extraction | `extractedLearnings > 0` |

### Scope detection tests (`src/__tests__/customization/scope-detection.test.ts`)

| Test | Assertion |
|------|-----------|
| Text with coding keywords → `#coding` | "debug this Python function" → `['#coding']` |
| Text with writing keywords → `#writing` | "develop Alice's character arc" → `['#writing']` |
| Text with no keywords → empty array | "hello how are you" → `[]` |
| Requires 2+ keyword matches | Single keyword not enough for scope claim |

### Extraction tests (`src/__tests__/customization/extraction.test.ts`)

| Test | Assertion |
|------|-----------|
| Empty history → no extractions | `totalExtracted: 0` |
| History with user preference → extracted | "I prefer tabs" → decision extracted |
| Extracted learnings go through HITL | `proposalCreated: true` for auto extractions |
| Scope hints merged with detected scopes | Both present in final learning |

---

## Completion Criteria (Addendum)

| Item | How to verify |
|------|---------------|
| `start_session` creates conversation record | Row in `conversations` table |
| `start_session` prefetches context | Non-empty `prefetchedContext` when learnings exist |
| `end_session` closes conversation | `ended_at` set in conversations row |
| `extract_learnings` extracts from history | At least 1 learning created from test conversation |
| Auto-scope detection works | Text with coding keywords → `#coding` scope |
| Project auto-association works | Session with matching scopes → project linked |
| MCP tool descriptions present | `tools/list` returns descriptions for all 7 tools |
| MCP system prompt exposed | `prompts/list` returns `chorum-memory-system` prompt |
| `inject_learning` works without explicit scopes | Auto-detection fallback triggers |

---

## Codex Notes (Addendum)

**`callExtractionProvider` is a stub in Phase 3:** The actual LLM call for extraction requires the provider system (Phase 4). For Phase 3, implement a minimal version that calls the cheapest available API key from environment variables (`OPENAI_API_KEY` or `GOOGLE_AI_KEY`). If no API key is available, `extract_learnings` returns empty. This is acceptable — the tool still exists, the client LLM still calls it, and it starts working automatically once a provider is configured.

**Scope auto-detection is keyword-based in Phase 3:** It uses `domain_seeds.signal_keywords` for matching. This is intentionally simple. Phase 4 can upgrade to embedding-based scope detection using the domain cluster centroids.

**The MCP system prompt is the most important deliverable:** Without it, the client LLM won't call `start_session` or `inject_learning`. Test this with Claude Desktop: connect the MCP server, start a conversation, and verify the LLM calls `start_session` automatically.

**`scopes` is now optional on `inject_learning`:** The Zod schema default is `[]`, not `.min(1)`. Auto-detection fills in scopes when the client doesn't provide them. This removes friction for client LLMs that don't know what scope tags to use.

**Conversation history is optional on `end_session`:** Some MCP clients may not be able to provide full conversation history. When history is absent, `end_session` just closes the record. When present, it triggers extraction. Both paths are valid.
