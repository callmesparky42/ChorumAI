# Phase 4 Specification: Agent Layer (Layer 3) — Providers, Personas, Routing

**Version:** 1.0
**Date:** 2026-02-27
**Status:** Ready for execution
**Assigned to:** Codex (all Phase 4 files)
**Guardian gates:** `chorum-layer-guardian` (every phase), `mcp-contract-agent` (re-run after provider wiring)
**Prerequisite:** Phase 3 complete — ChorumClient implemented; MCP surface with 7 tools passing; `mcp-contract-agent` passing; `callExtractionProvider` stub acknowledged as Phase 4 debt

---

## Agent Instructions

You are executing **Phase 4** of the Chorum 2.0 build. This phase implements the Agent Layer — Layer 3 — which sits directly above Customization. It owns provider routing (borrowed from v1), persona definitions, task-aware model selection, tool access controls, and the `AgentInterface` contract that the Shell (Phase 5) calls.

Read this document completely before writing a single file. Every decision is locked.

**What you will produce:**
1. `src/lib/providers/` — Provider system borrowed from v1 (13 files, adapted for v2 imports)
2. `src/lib/agents/types.ts` — All Phase 4 types + Zod schemas
3. `src/lib/agents/personas.ts` — Persona registry (system + user-defined)
4. `src/lib/agents/router.ts` — Task-aware routing + model selection
5. `src/lib/agents/tools.ts` — Tool access control layer
6. `src/lib/agents/chat.ts` — Streaming chat + sync chat implementation
7. `src/lib/agents/agent.ts` — AgentImpl wiring
8. `src/lib/agents/interface.ts` — Full `AgentInterface` replacing the Phase 0 stub
9. `src/lib/agents/index.ts` — Public exports
10. `drizzle/0005_agent_layer.sql` — Migration: `provider_configs` + `personas` tables
11. `src/db/schema.ts` amendment — Add new table definitions
12. Wire `callExtractionProvider` in `src/lib/customization/extraction.ts` (Phase 3 debt)
13. `src/app/api/cron/embedding-backfill/route.ts` — Background embedding computation

**What you will NOT produce:**
- Any UI components (Phase 5)
- Any modifications to Layer 0 or Layer 1 internal files
- Any `any` types or `@ts-ignore` comments

**Layer 3 import rule:** `src/lib/agents/` may import from `@/lib/nebula` (types), `@/lib/core` (BinaryStarInterface), `@/lib/customization` (ChorumClient, config), and `@/lib/providers` (provider routing). No imports from `@/app`. `@/lib/providers` is a utility layer — it has no Chorum-specific logic and depends on nothing in `src/lib/`.

---

## Reference Documents

| Document | Location | Governs |
|----------|----------|---------|
| Phase Architecture | `CHORUM_V2_PHASE_ARCHITECTURE.md` | Phase 4 scope, v1 provider borrow list |
| Layer Contracts | `docs/specs/LAYER_CONTRACTS.md` | AgentInterface, import rules |
| Phase 3 Review | `checks/PHASE_3_REVIEW.md` | Debt: `callExtractionProvider` stub |
| v1 Providers | `chorum-ai/src/lib/providers/` | 13 files to borrow |
| Checklist | `CHECKLIST_2.0.md` | Phase 4 → Phase 5 transition gates |

---

## Locked Decisions

### Decision 1: Provider system is borrowed verbatim from v1

The 13 files in `chorum-ai/src/lib/providers/` are copied to `chorum-v2/src/lib/providers/`. The only allowed changes:
- Remove the `@/lib/pii` import (PII anonymization moves to Phase 5 Shell or is dropped)
- Update any `@/` path aliases if they differ
- Remove `shelved_image_generation.ts` (not needed in v2)

The provider system is a **utility layer** — it knows nothing about Nebula, Podium, or Conductor. It routes calls to LLM APIs. That's all.

### Decision 2: Persona definitions stored in database

Personas are rows in a `personas` table, not hardcoded config files. System personas ship as seed data. Users can create custom personas. Each persona defines: system prompt template, default model preference, temperature, scope filter, and allowed tools.

### Decision 3: Provider configs stored per-user

User API keys and provider preferences live in `provider_configs` table (encrypted at rest via `ENCRYPTION_KEY`). The Shell (Phase 5) manages these via settings UI. Phase 4 provides the CRUD and routing logic.

### Decision 4: AgentInterface matches Phase 0 contract

The `AgentInterface` defined in `docs/specs/LAYER_CONTRACTS.md` (Phase 0) is the binding contract:

```typescript
export interface AgentInterface {
  chat(input: AgentChatInput): AsyncGenerator<string>    // streaming
  chatSync(input: AgentChatInput): Promise<AgentChatResult>
  getAgents(userId: string): Promise<AgentDefinition[]>
  route(query: string, userId: string): Promise<AgentDefinition>
}
```

### Decision 5: Model selection is task-aware

The router picks a model based on: (1) persona preference, (2) query complexity, (3) context window needs (from Podium tier), (4) user's configured providers, (5) cost tier. The user never directly picks a model in v2 — the system routes automatically. Override is possible via `agentId` in `AgentChatInput`.

---

## Step 1: Migration `drizzle/0005_agent_layer.sql`

```sql
-- drizzle/0005_agent_layer.sql
-- Phase 4: Provider configs + Personas

-- Per-user provider configuration (API keys stored encrypted)
CREATE TABLE provider_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  provider        TEXT NOT NULL,           -- 'openai' | 'anthropic' | 'google' | etc.
  api_key_enc     TEXT NOT NULL,           -- AES-256-GCM encrypted; plaintext never stored
  model_override  TEXT,                    -- null = use registry default
  base_url        TEXT,                    -- null = use provider default
  is_local        BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  priority        INTEGER NOT NULL DEFAULT 0,  -- lower = preferred; for fallback ordering
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX provider_configs_user_idx ON provider_configs(user_id);
CREATE INDEX provider_configs_lookup_idx ON provider_configs(user_id, is_enabled, priority);

-- Persona definitions (system + user-defined)
CREATE TABLE personas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID,                    -- null = system persona (available to all)
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  system_prompt       TEXT NOT NULL,           -- template; supports {{context}} placeholder
  default_provider    TEXT,                    -- preferred provider; null = auto-route
  default_model       TEXT,                    -- preferred model; null = auto-route
  temperature         DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  max_tokens          INTEGER NOT NULL DEFAULT 4096,
  scope_filter        JSONB NOT NULL DEFAULT '{"include":[],"exclude":[],"boost":[]}',
  allowed_tools       JSONB NOT NULL DEFAULT '[]',  -- MCP tool names this persona may invoke
  is_system           BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personas_user_idx ON personas(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX personas_system_idx ON personas(is_system) WHERE is_system = TRUE;
```

### 1.1 Add to `src/db/schema.ts`

```typescript
// ---------------------------------------------------------------------------
// Table: provider_configs — Per-user LLM provider API keys + preferences
// ---------------------------------------------------------------------------

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    userId:        uuid('user_id').notNull(),
    provider:      text('provider').notNull(),
    apiKeyEnc:     text('api_key_enc').notNull(),
    modelOverride: text('model_override'),
    baseUrl:       text('base_url'),
    isLocal:       boolean('is_local').notNull().default(false),
    isEnabled:     boolean('is_enabled').notNull().default(true),
    priority:      integer('priority').notNull().default(0),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('provider_configs_user_provider_idx').on(table.userId, table.provider),
    index('provider_configs_user_idx').on(table.userId),
    index('provider_configs_lookup_idx').on(table.userId, table.isEnabled, table.priority),
  ]
)

// ---------------------------------------------------------------------------
// Table: personas — System + user-defined agent personas
// ---------------------------------------------------------------------------

export const personas = pgTable(
  'personas',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    userId:          uuid('user_id'),
    name:            text('name').notNull(),
    description:     text('description').notNull().default(''),
    systemPrompt:    text('system_prompt').notNull(),
    defaultProvider: text('default_provider'),
    defaultModel:    text('default_model'),
    temperature:     doublePrecision('temperature').notNull().default(0.7),
    maxTokens:       integer('max_tokens').notNull().default(4096),
    scopeFilter:     jsonb('scope_filter').notNull().default(
      sql`'{"include":[],"exclude":[],"boost":[]}'::jsonb`
    ),
    allowedTools:    jsonb('allowed_tools').notNull().default(sql`'[]'::jsonb`),
    isSystem:        boolean('is_system').notNull().default(false),
    isActive:        boolean('is_active').notNull().default(true),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('personas_user_idx').on(table.userId),
    index('personas_system_idx').on(table.isSystem),
  ]
)
```

### 1.2 Apply migration

```bash
npx drizzle-kit generate --name agent_layer
npx drizzle-kit migrate
```

---

## Step 2: Copy v1 Providers

Copy all files from `chorum-ai/src/lib/providers/` to `chorum-v2/src/lib/providers/`:

```
types.ts              ← shared types (ChatMessage, ChatResult, ProviderCallConfig, etc.)
registry.ts           ← MODEL_REGISTRY, getDefaultModel, getCheapModel, getContextWindow
index.ts              ← callProvider router, isProviderSupported
anthropic.ts          ← Anthropic (Claude) provider
openai.ts             ← OpenAI provider
google.ts             ← Google (Gemini) provider
mistral.ts            ← Mistral provider
deepseek.ts           ← DeepSeek provider
ollama.ts             ← Ollama (local) provider
openai-compatible.ts  ← OpenAI-compatible fallback (Perplexity, xAI, LM Studio, etc.)
cheapest.ts           ← cheapest provider selection utility
fallback.ts           ← fallback chain logic
```

**Do NOT copy:** `shelved_image_generation.ts` (not needed in v2).

**Required edits after copy:**
1. In `index.ts`: Remove the `import { anonymizePii } from '@/lib/pii'` line and all PII anonymization logic in `callProvider`. PII handling moves to Phase 5 Shell layer.
2. In `index.ts`: Remove the `generateImage` function and its import of `callOpenAIImage`. Image generation is not a Phase 4 concern.
3. Verify all `@/` imports resolve correctly in the v2 project (providers should have zero `@/lib/` imports — they only import from each other and third-party packages).

**Validation:** After copy, run `npx tsc --noEmit` — all provider files must compile with zero errors. If any v1-specific imports fail, replace with direct relative imports within the providers directory.

---

## Step 3: `src/lib/agents/types.ts`

```typescript
// src/lib/agents/types.ts
import { z } from 'zod'
import type { ScopeFilter, LearningType } from '@/lib/nebula/types'
import type { QueryIntent, DomainSignal } from '@/lib/core'

// ---------------------------------------------------------------------------
// Agent / Persona definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string
  name: string
  description: string
  scopeFilter: ScopeFilter
  systemPromptTemplate: string   // supports {{context}} placeholder
  defaultProvider: string | null
  defaultModel: string | null
  temperature: number
  maxTokens: number
  allowedTools: string[]
  isSystem: boolean
}

// ---------------------------------------------------------------------------
// Chat input / output
// ---------------------------------------------------------------------------

export interface AgentChatInput {
  userId: string
  conversationId: string
  message: string
  agentId?: string                // if null, auto-route
  history: { role: 'user' | 'assistant'; content: string }[]
  contextWindowSize: number
  scopeHints?: string[]
  domainSignal?: DomainSignal
}

export interface AgentChatResult {
  response: string
  agentUsed: AgentDefinition
  injectedContext: string
  tokensUsed: number
  conversationId: string
  model: string
  provider: string
}

// ---------------------------------------------------------------------------
// Provider config (user-facing, decrypted)
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  id: string
  userId: string
  provider: string
  apiKey: string              // decrypted — never stored or logged
  modelOverride: string | null
  baseUrl: string | null
  isLocal: boolean
  isEnabled: boolean
  priority: number
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical'

export interface RoutingDecision {
  persona: AgentDefinition
  provider: string
  model: string
  contextWindowSize: number
  reason: string
}

// ---------------------------------------------------------------------------
// Zod schemas for API validation
// ---------------------------------------------------------------------------

export const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  systemPrompt: z.string().min(1).max(10000),
  defaultProvider: z.string().nullable().default(null),
  defaultModel: z.string().nullable().default(null),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(200000).default(4096),
  scopeFilter: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    boost: z.array(z.string()).default([]),
  }).default({ include: [], exclude: [], boost: [] }),
  allowedTools: z.array(z.string()).default([]),
})

export type CreatePersonaInput = z.infer<typeof CreatePersonaSchema>

export const SaveProviderConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  modelOverride: z.string().nullable().default(null),
  baseUrl: z.string().nullable().default(null),
  isLocal: z.boolean().default(false),
  priority: z.number().int().min(0).default(0),
})

export type SaveProviderConfigInput = z.infer<typeof SaveProviderConfigSchema>
```

---

## Step 4: `src/lib/agents/personas.ts`

Persona registry — CRUD + system seed personas.

```typescript
// src/lib/agents/personas.ts
// Persona management. System personas ship with app; users create custom ones.
// Personas define how the agent behaves: prompt template, model preference,
// scope filter, allowed tools. They are NOT providers — they are behavioral profiles.

import { db } from '@/db'
import { personas } from '@/db/schema'
import { eq, or, isNull, and } from 'drizzle-orm'
import type { AgentDefinition, CreatePersonaInput } from './types'
import type { ScopeFilter } from '@/lib/nebula/types'

function toAgentDefinition(row: typeof personas.$inferSelect): AgentDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scopeFilter: row.scopeFilter as ScopeFilter,
    systemPromptTemplate: row.systemPrompt,
    defaultProvider: row.defaultProvider,
    defaultModel: row.defaultModel,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    allowedTools: (row.allowedTools as string[]) ?? [],
    isSystem: row.isSystem,
  }
}

/** Get all personas available to a user (system + user-defined). */
export async function getPersonas(userId: string): Promise<AgentDefinition[]> {
  const rows = await db
    .select()
    .from(personas)
    .where(
      and(
        or(isNull(personas.userId), eq(personas.userId, userId)),
        eq(personas.isActive, true),
      )
    )
  return rows.map(toAgentDefinition)
}

/** Get a single persona by ID. */
export async function getPersona(id: string): Promise<AgentDefinition | null> {
  const [row] = await db.select().from(personas).where(eq(personas.id, id))
  return row ? toAgentDefinition(row) : null
}

/** Create a custom persona for a user. */
export async function createPersona(
  userId: string,
  input: CreatePersonaInput,
): Promise<AgentDefinition> {
  const [row] = await db.insert(personas).values({
    userId,
    name: input.name,
    description: input.description,
    systemPrompt: input.systemPrompt,
    defaultProvider: input.defaultProvider,
    defaultModel: input.defaultModel,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    scopeFilter: input.scopeFilter,
    allowedTools: input.allowedTools,
    isSystem: false,
  }).returning()
  return toAgentDefinition(row)
}

/** Delete a user persona. System personas cannot be deleted. */
export async function deletePersona(id: string, userId: string): Promise<boolean> {
  const persona = await getPersona(id)
  if (!persona || persona.isSystem) return false
  await db.delete(personas).where(
    and(eq(personas.id, id), eq(personas.userId, userId))
  )
  return true
}
```

---

## Step 5: `src/lib/agents/router.ts`

Task-aware routing. Picks the best persona + provider + model for each query.

```typescript
// src/lib/agents/router.ts
// Task-aware routing — picks persona + provider + model based on:
// 1. Explicit agentId override (if provided)
// 2. Scope tag match between query context and persona scope filters
// 3. Query complexity → model tier mapping
// 4. User's configured providers → best available model
// 5. Fallback to system default persona + cheapest available provider

import type { AgentDefinition, ProviderConfig, RoutingDecision, TaskComplexity } from './types'
import type { DomainSignal } from '@/lib/core'
import { getPersonas, getPersona } from './personas'
import { getUserProviders } from './provider-configs'
import { getContextWindow, getCheapModel, getDefaultModel } from '@/lib/providers'

// Complexity → minimum model tier mapping
const COMPLEXITY_TIERS: Record<TaskComplexity, 'fast' | 'standard' | 'flagship'> = {
  trivial:  'fast',
  simple:   'fast',
  moderate: 'standard',
  complex:  'flagship',
  critical: 'flagship',
}

/**
 * Estimate task complexity from query text.
 * Phase 4: keyword heuristic. Phase 5+ can upgrade to LLM-based classification.
 */
export function estimateComplexity(query: string): TaskComplexity {
  const lower = query.toLowerCase()
  const len = query.length

  if (len < 20) return 'trivial'
  if (/\b(hello|hi|hey|thanks|bye|good morning)\b/.test(lower)) return 'trivial'
  if (/\b(explain|analyze|compare|design|architect|refactor|debug|optimize)\b/.test(lower))
    return 'complex'
  if (/\b(review|implement|create|build|write)\b/.test(lower)) return 'moderate'
  if (len > 500) return 'complex'
  return 'simple'
}

/**
 * Route a query to the best persona + provider + model.
 */
export async function route(
  query: string,
  userId: string,
  agentId?: string,
  domainSignal?: DomainSignal,
  contextWindowSize?: number,
): Promise<RoutingDecision> {
  // 1. If explicit agentId, use that persona
  if (agentId) {
    const persona = await getPersona(agentId)
    if (persona) {
      const { provider, model } = await resolveProviderForPersona(persona, userId)
      return {
        persona,
        provider,
        model,
        contextWindowSize: contextWindowSize ?? getContextWindow(provider, model),
        reason: `explicit agent override: ${persona.name}`,
      }
    }
  }

  // 2. Find best persona by scope match
  const allPersonas = await getPersonas(userId)
  const complexity = estimateComplexity(query)
  const detected = domainSignal?.detected ?? []

  let bestPersona = allPersonas.find((p) => p.name === 'default') ?? allPersonas[0]
  let bestScore = 0

  if (!bestPersona) {
    throw new Error('No personas available. Seed system personas first.')
  }

  for (const persona of allPersonas) {
    const includeScopes = persona.scopeFilter.include
    if (includeScopes.length === 0) continue  // generic persona — skip for scoring

    const overlap = detected.filter((s) => includeScopes.includes(s)).length
    if (overlap > bestScore) {
      bestScore = overlap
      bestPersona = persona
    }
  }

  // 3. Resolve provider + model
  const { provider, model } = await resolveProviderForPersona(
    bestPersona, userId, COMPLEXITY_TIERS[complexity],
  )

  return {
    persona: bestPersona,
    provider,
    model,
    contextWindowSize: contextWindowSize ?? getContextWindow(provider, model),
    reason: `auto-routed: persona=${bestPersona.name}, complexity=${complexity}, scope_overlap=${bestScore}`,
  }
}

/**
 * Resolve the best provider + model for a persona given user's configured providers.
 */
async function resolveProviderForPersona(
  persona: AgentDefinition,
  userId: string,
  minTier?: 'fast' | 'standard' | 'flagship',
): Promise<{ provider: string; model: string }> {
  const configs = await getUserProviders(userId)

  // Persona has explicit preference
  if (persona.defaultProvider) {
    const match = configs.find((c) => c.provider === persona.defaultProvider && c.isEnabled)
    if (match) {
      const model = persona.defaultModel ?? getDefaultModel(match.provider)
      return { provider: match.provider, model }
    }
  }

  // Fallback: pick by priority order, filtered by minimum tier
  const sorted = configs.filter((c) => c.isEnabled).sort((a, b) => a.priority - b.priority)
  if (sorted.length === 0) {
    throw new Error('No providers configured. Add at least one provider in settings.')
  }

  const chosen = sorted[0]
  const model = minTier === 'fast'
    ? getCheapModel(chosen.provider)
    : getDefaultModel(chosen.provider)

  return { provider: chosen.provider, model: model ?? 'auto' }
}
```

---

## Step 6: `src/lib/agents/provider-configs.ts`

Provider config CRUD with encryption.

```typescript
// src/lib/agents/provider-configs.ts
// Per-user provider configuration CRUD.
// API keys are encrypted with AES-256-GCM before storage.
// Plaintext keys are NEVER logged or stored.

import { db } from '@/db'
import { providerConfigs } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import type { ProviderConfig, SaveProviderConfigInput } from './types'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = () => {
  const k = process.env.ENCRYPTION_KEY
  if (!k) throw new Error('ENCRYPTION_KEY environment variable is required')
  return Buffer.from(k, 'base64').subarray(0, 32)
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

function decrypt(data: string): string {
  const [ivHex, tagHex, encrypted] = data.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY(), iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function toProviderConfig(row: typeof providerConfigs.$inferSelect): ProviderConfig {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    apiKey: decrypt(row.apiKeyEnc),
    modelOverride: row.modelOverride,
    baseUrl: row.baseUrl,
    isLocal: row.isLocal,
    isEnabled: row.isEnabled,
    priority: row.priority,
  }
}

export async function getUserProviders(userId: string): Promise<ProviderConfig[]> {
  const rows = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.userId, userId))
  return rows.map(toProviderConfig)
}

export async function saveProviderConfig(
  userId: string,
  input: SaveProviderConfigInput,
): Promise<ProviderConfig> {
  const encrypted = encrypt(input.apiKey)

  const [row] = await db
    .insert(providerConfigs)
    .values({
      userId,
      provider: input.provider,
      apiKeyEnc: encrypted,
      modelOverride: input.modelOverride,
      baseUrl: input.baseUrl,
      isLocal: input.isLocal,
      priority: input.priority,
    })
    .onConflictDoUpdate({
      target: [providerConfigs.userId, providerConfigs.provider],
      set: {
        apiKeyEnc: encrypted,
        modelOverride: input.modelOverride,
        baseUrl: input.baseUrl,
        isLocal: input.isLocal,
        priority: input.priority,
        isEnabled: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  return toProviderConfig(row)
}

export async function disableProvider(userId: string, provider: string): Promise<void> {
  await db
    .update(providerConfigs)
    .set({ isEnabled: false, updatedAt: new Date() })
    .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.provider, provider)))
}

export async function deleteProviderConfig(userId: string, provider: string): Promise<void> {
  await db
    .delete(providerConfigs)
    .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.provider, provider)))
}
```

---

## Step 7: `src/lib/agents/tools.ts`

Tool access control — determines which MCP tools a persona may invoke.

```typescript
// src/lib/agents/tools.ts
// Tool access control for personas.
// Each persona has an allowedTools list. If empty, all tools are allowed.
// This prevents a "coding" persona from calling writing-specific tools, etc.

import type { AgentDefinition } from './types'

const ALL_TOOLS = [
  'start_session', 'get_context', 'read_nebula',
  'inject_learning', 'extract_learnings',
  'submit_feedback', 'end_session',
]

/**
 * Check if a persona is allowed to invoke a specific tool.
 * Empty allowedTools = all tools allowed (no restriction).
 */
export function isToolAllowed(persona: AgentDefinition, tool: string): boolean {
  if (persona.allowedTools.length === 0) return true
  return persona.allowedTools.includes(tool)
}

/**
 * Get the list of tools available to a persona.
 */
export function getAvailableTools(persona: AgentDefinition): string[] {
  if (persona.allowedTools.length === 0) return ALL_TOOLS
  return persona.allowedTools.filter((t) => ALL_TOOLS.includes(t))
}
```

---

## Step 8: `src/lib/agents/chat.ts`

Streaming and sync chat implementation.

```typescript
// src/lib/agents/chat.ts
// Core chat implementation. Wires: routing → context injection → provider call → audit.

import type { AgentChatInput, AgentChatResult, AgentDefinition } from './types'
import { route } from './router'
import { createBinaryStar } from '@/lib/core'
import { createNebula } from '@/lib/nebula'
import type { PodiumRequest, DomainSignal } from '@/lib/core'
import { callProvider } from '@/lib/providers'
import type { ChatMessage } from '@/lib/providers'
import { getUserProviders } from './provider-configs'
import { detectScopes } from '@/lib/customization/scope-detection'

function buildSystemPrompt(persona: AgentDefinition, context: string): string {
  const template = persona.systemPromptTemplate
  return template.includes('{{context}}')
    ? template.replace('{{context}}', context)
    : context ? `${context}\n\n${template}` : template
}

/**
 * Synchronous (non-streaming) chat.
 */
export async function chatSync(input: AgentChatInput): Promise<AgentChatResult> {
  // 1. Route to persona + provider + model
  const decision = await route(
    input.message,
    input.userId,
    input.agentId,
    input.domainSignal,
    input.contextWindowSize,
  )

  // 2. Get context from Podium
  const nebula = createNebula()
  const binaryStar = createBinaryStar(nebula)

  const scopes = input.scopeHints ?? await detectScopes(input.message, input.userId)
  const domainSignal: DomainSignal = input.domainSignal ?? {
    primary: null, confidence: 0, detected: scopes,
  }

  // Compute embedding for the query
  const { computeEmbedding } = await import('@/lib/customization/extraction')

  let queryEmbedding: number[] = []
  try {
    queryEmbedding = await computeEmbedding(input.message)
  } catch {
    // No embedding available — Podium falls back to scope/recency
  }

  const podiumResult = await binaryStar.getContext({
    userId: input.userId,
    conversationId: input.conversationId,
    queryText: input.message,
    queryEmbedding,
    scopeFilter: decision.persona.scopeFilter,
    domainSignal,
    intent: 'question',
    contextWindowSize: decision.contextWindowSize,
  })

  // 3. Build system prompt with injected context
  const systemPrompt = buildSystemPrompt(decision.persona, podiumResult.compiledContext)

  // 4. Call provider
  const providers = await getUserProviders(input.userId)
  const config = providers.find((p) => p.provider === decision.provider)
  if (!config) throw new Error(`Provider ${decision.provider} not configured`)

  const messages: ChatMessage[] = [
    ...input.history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: input.message },
  ]

  const result = await callProvider(
    {
      provider: decision.provider,
      apiKey: config.apiKey,
      model: decision.model,
      baseUrl: config.baseUrl ?? undefined,
      isLocal: config.isLocal,
    },
    messages,
    systemPrompt,
  )

  return {
    response: result.content,
    agentUsed: decision.persona,
    injectedContext: podiumResult.compiledContext,
    tokensUsed: result.tokensInput + result.tokensOutput,
    conversationId: input.conversationId,
    model: result.model ?? decision.model,
    provider: decision.provider,
  }
}

/**
 * Streaming chat — yields response chunks as they arrive.
 */
export async function* chat(input: AgentChatInput): AsyncGenerator<string> {
  // Phase 4: streaming is implemented as a single yield of the full response.
  // Phase 5 can upgrade to true SSE streaming when the Shell UI is built.
  const result = await chatSync(input)
  yield result.response
}
```

---

## Step 9: `src/lib/agents/agent.ts` + `interface.ts` + `index.ts`

```typescript
// src/lib/agents/interface.ts — matches Phase 0 contract exactly
import type { AgentDefinition, AgentChatInput, AgentChatResult } from './types'

export interface AgentInterface {
  chat(input: AgentChatInput): AsyncGenerator<string>
  chatSync(input: AgentChatInput): Promise<AgentChatResult>
  getAgents(userId: string): Promise<AgentDefinition[]>
  route(query: string, userId: string): Promise<AgentDefinition>
}
```

```typescript
// src/lib/agents/agent.ts — wiring
import type { AgentInterface } from './interface'
import type { AgentDefinition, AgentChatInput, AgentChatResult } from './types'
import { getPersonas } from './personas'
import { route as routeQuery } from './router'
import { chat as chatStream, chatSync as chatSyncImpl } from './chat'

export class AgentImpl implements AgentInterface {
  async *chat(input: AgentChatInput): AsyncGenerator<string> {
    yield* chatStream(input)
  }

  async chatSync(input: AgentChatInput): Promise<AgentChatResult> {
    return chatSyncImpl(input)
  }

  async getAgents(userId: string): Promise<AgentDefinition[]> {
    return getPersonas(userId)
  }

  async route(query: string, userId: string): Promise<AgentDefinition> {
    const decision = await routeQuery(query, userId)
    return decision.persona
  }
}

export function createAgent(): AgentInterface {
  return new AgentImpl()
}
```

```typescript
// src/lib/agents/index.ts
export type { AgentInterface } from './interface'
export type { AgentDefinition, AgentChatInput, AgentChatResult,
  ProviderConfig, RoutingDecision, TaskComplexity,
  CreatePersonaInput, SaveProviderConfigInput } from './types'
export { createAgent } from './agent'
export { getPersonas, getPersona, createPersona, deletePersona } from './personas'
export { route, estimateComplexity } from './router'
export { getUserProviders, saveProviderConfig,
  disableProvider, deleteProviderConfig } from './provider-configs'
export { isToolAllowed, getAvailableTools } from './tools'
```

---

## Step 10: Wire `callExtractionProvider` (Phase 3 Debt)

In `src/lib/customization/extraction.ts`, replace the stub `callExtractionProvider` with a real implementation:

```typescript
async function callExtractionProvider(
  systemPrompt: string,
  conversationText: string,
): Promise<Array<{ content: string; type: string; scopes: string[] }>> {
  // Use the agent layer's provider routing to find the cheapest available provider
  const { getUserProviders } = await import('@/lib/agents/provider-configs')
  const { callProvider } = await import('@/lib/providers')
  const { getCheapModel } = await import('@/lib/providers')

  // Get the calling user's providers — extraction runs in user context
  // For now, check env vars as fallback if no user providers configured
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.GOOGLE_AI_KEY
  const provider = process.env.OPENAI_API_KEY ? 'openai' : 'google'

  if (!apiKey) {
    console.warn('[extraction] No API key available for extraction provider')
    return []
  }

  const model = getCheapModel(provider)

  try {
    const result = await callProvider(
      { provider, apiKey, model },
      [{ role: 'user', content: conversationText }],
      systemPrompt,
    )

    // Parse JSON from response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('[extraction] Provider call failed:', err)
    return []
  }
}
```

Also export `computeEmbedding` from extraction.ts for use by the chat layer:

```typescript
export async function computeEmbedding(text: string): Promise<number[]> {
  // Phase 4: compute embedding using cheapest available provider
  // Uses OpenAI text-embedding-3-small (1536 dims) if available
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) return []
  const json = await response.json()
  return json.data?.[0]?.embedding ?? []
}
```

---

## Step 11: Embedding Backfill Cron

`src/app/api/cron/embedding-backfill/route.ts` — compute embeddings for learnings missing them.

```typescript
// src/app/api/cron/embedding-backfill/route.ts
import { NextResponse } from 'next/server'
import { createNebula } from '@/lib/nebula'
import { computeEmbedding } from '@/lib/customization/extraction'

export async function GET() {
  const nebula = createNebula()
  const missing = await nebula.getLearningsWithoutEmbedding(1536, 50)

  let processed = 0
  for (const learning of missing) {
    try {
      const embedding = await computeEmbedding(learning.content)
      if (embedding.length > 0) {
        await nebula.setEmbedding(learning.id, embedding, 1536, 'text-embedding-3-small')
        processed++
      }
    } catch {
      continue
    }
  }

  return NextResponse.json({ processed, total: missing.length })
}
```

---

## Step 12: System Persona Seeds

Create `drizzle/0005b_seed_personas.sql`:

```sql
-- System personas — shipped with Chorum v2
INSERT INTO personas (name, description, system_prompt, is_system, temperature, scope_filter) VALUES
(
  'default',
  'General-purpose assistant with full memory access',
  'You are a helpful assistant. You have access to a persistent knowledge graph that remembers things across conversations. Use the injected context below to inform your responses.

{{context}}',
  true,
  0.7,
  '{"include":[],"exclude":[],"boost":[]}'
),
(
  'coder',
  'Software engineering specialist optimized for code tasks',
  'You are an expert software engineer. You write clean, well-tested, production-quality code. Use the project context below — these are verified patterns, decisions, and rules from this codebase.

{{context}}

When writing code: follow existing patterns, respect stated decisions, and avoid documented antipatterns.',
  true,
  0.3,
  '{"include":["#coding"],"exclude":[],"boost":["#python","#typescript","#react"]}'
),
(
  'writer',
  'Creative writing assistant with character/world consistency',
  'You are a skilled creative writing collaborator. You maintain consistency with established characters, world rules, and voice. The context below contains the canon for this story.

{{context}}

Stay in character. Maintain voice consistency. Reference established plot threads naturally.',
  true,
  0.9,
  '{"include":["#writing"],"exclude":[],"boost":["#fiction","#worldbuilding"]}'
),
(
  'analyst',
  'Data analysis and strategic thinking specialist',
  'You are a rigorous analyst. You think in frameworks, cite evidence, and challenge assumptions. Use the context below as your reference facts.

{{context}}

Be precise. Question assumptions. Show your reasoning.',
  true,
  0.4,
  '{"include":[],"exclude":[],"boost":["#trading","#research"]}'
);
```

---

## Build Verification

```bash
npx next build
```

Expected: exit 0, zero TypeScript errors.

---

## Test Contract

### Persona tests (`src/__tests__/agents/personas.test.ts`)

| Test | Assertion |
|------|-----------|
| `getPersonas` returns system + user personas | System personas available to all users |
| `createPersona` creates user persona | Returns with ID, `isSystem: false` |
| `deletePersona` on system persona → false | System personas protected |
| `deletePersona` on own persona → true | User persona deleted |

### Router tests (`src/__tests__/agents/router.test.ts`)

| Test | Assertion |
|------|-----------|
| `estimateComplexity('hello')` → `'trivial'` | Short greetings classified correctly |
| `estimateComplexity('refactor the auth module')` → `'complex'` | Complex keywords detected |
| `route` with agentId → returns specified persona | Explicit override works |
| `route` with coding scopes → returns 'coder' persona | Scope matching works |
| `route` with no providers → throws | Missing provider detected |

### Provider config tests (`src/__tests__/agents/provider-configs.test.ts`)

| Test | Assertion |
|------|-----------|
| `saveProviderConfig` → encrypts API key | `api_key_enc` is not plaintext |
| `getUserProviders` → decrypts API key | Returned `apiKey` matches original |
| `disableProvider` → sets `isEnabled: false` | Provider excluded from routing |
| Upsert on same provider → updates, not duplicates | Unique constraint enforced |

### Chat tests (`src/__tests__/agents/chat.test.ts`)

| Test | Assertion |
|------|-----------|
| `chatSync` → returns response with all fields | `response`, `agentUsed`, `provider`, `model` present |
| `chatSync` → injects Podium context | `injectedContext` non-empty when learnings exist |
| `chat` → yields at least one chunk | Streaming generator produces output |

---

## Guardian Validation

### chorum-layer-guardian

| Check | Expected |
|-------|----------|
| `src/lib/agents/` imports only from `@/lib/nebula`, `@/lib/core`, `@/lib/customization`, `@/lib/providers` | No Layer 4 imports |
| `src/lib/providers/` imports from nothing in `@/lib/` | Utility layer — zero Chorum imports |
| No reverse imports (Layer 0/1/2 importing from Layer 3) | Import direction intact |

### mcp-contract-agent (re-run)

| Check | Expected |
|-------|----------|
| `callExtractionProvider` no longer a stub | Real provider call implemented |
| All 7 MCP tools still functional | No regressions from Phase 3 |

---

## Completion Criteria

| Checklist Item | How to verify |
|----------------|---------------|
| Provider system copied and compiling | `npx tsc --noEmit` passes with providers |
| `AgentInterface` implemented | `createAgent()` returns working `AgentImpl` |
| Personas CRUD works | System + user personas queryable |
| Task-aware routing | `route()` returns different models for trivial vs complex queries |
| Provider configs encrypted | `api_key_enc` column contains ciphertext |
| `callExtractionProvider` wired | `extract_learnings` returns real results when API key configured |
| Embedding backfill cron | `/api/cron/embedding-backfill` processes missing embeddings |
| 4 system personas seeded | `default`, `coder`, `writer`, `analyst` in personas table |
| `chorum-layer-guardian` passes | Zero layer violations |
| Build passes | `npx next build` exit 0 |

---

## Changelog Entry

```markdown
## [2.0.0-alpha.4] — Phase 4: Agent Layer (Layer 3)

### Added
- Provider system (13 files borrowed from v1, adapted for v2)
- Supports: Anthropic, OpenAI, Google, Mistral, DeepSeek, Ollama, OpenAI-compatible
- Per-user provider configuration with AES-256-GCM encrypted API keys
- Persona system: 4 system personas (default, coder, writer, analyst)
- Custom persona CRUD for user-defined behavioral profiles
- Task-aware routing: complexity estimation → model tier → provider selection
- Tool access control per persona
- AgentInterface implementation (streaming + sync chat)
- Embedding backfill cron job
- Wired callExtractionProvider (Phase 3 debt resolved)
- Migration 0005_agent_layer.sql — provider_configs + personas tables
- Seed data: 4 system personas

### Architecture
- Layer 3 imports only from Layers 0-2 public interfaces + providers utility
- Providers are a utility layer with zero Chorum-specific imports
- Routing is automatic — users never directly pick models
- System prompt templates support {{context}} placeholder for Podium injection
```

---

## Codex Notes

**Provider system is a utility layer:** `src/lib/providers/` must have ZERO imports from `@/lib/nebula`, `@/lib/core`, `@/lib/customization`, or `@/lib/agents`. It is a standalone LLM routing library. If you find yourself adding Chorum-specific logic to a provider file, STOP — that logic belongs in `src/lib/agents/`.

**Encryption key format:** `ENCRYPTION_KEY` must be a base64-encoded 32-byte key. Generate with `openssl rand -base64 32`. The encrypt/decrypt functions use AES-256-GCM with random IV and authentication tags. Never log decrypted keys.

**Streaming is single-yield in Phase 4:** True SSE streaming requires Shell UI integration (Phase 5). The `chat()` AsyncGenerator currently yields the full response as a single chunk. Phase 5 will upgrade this to word-by-word streaming using the provider's native streaming APIs.

**`computeEmbedding` is a shared utility:** It's exported from `extraction.ts` and used by both extraction and chat. In a future refactor it should move to a dedicated `src/lib/agents/embeddings.ts` or a shared utility. For Phase 4, the current location is acceptable.

**Persona scope matching is intentionally simple:** Phase 4 uses scope tag overlap count. Phase 5 can upgrade to embedding-based persona routing using the domain cluster centroids. The simple approach works well for the 4 system personas with clear scope boundaries.
