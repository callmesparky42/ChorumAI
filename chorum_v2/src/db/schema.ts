// src/db/schema.ts
// Phase 1: Full Nebula schema — all 14 tables
// IMPORTANT: Do not add business logic here. Table definitions only.

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  doublePrecision,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Custom pgvector column types
// Drizzle does not have a built-in vector type. Use customType per the docs.
// Two separate types — do not merge dimensions into one column.
// ---------------------------------------------------------------------------

function makeVector(dims: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dims})`,
    toDriver: (v: number[]): string => `[${v.join(',')}]`,
    fromDriver: (v: string): number[] => (v as string).slice(1, -1).split(',').map(Number),
  })
}

const vector1536 = makeVector(1536)
const vector384 = makeVector(384)

// ---------------------------------------------------------------------------
// Supabase auth schema reference — kept for RLS functions only, NOT used as FK
// ---------------------------------------------------------------------------

// authUsers is intentionally NOT exported and NOT referenced via .references()
// anywhere. The Supabase postgres role cannot INSERT into auth.users, so we
// use public.user_profiles (below) as the identity anchor instead.
const authSchema = pgSchema('auth')
const _authUsers = authSchema.table('users', { id: uuid('id').primaryKey() })
void _authUsers // suppress unused-variable lint

// ---------------------------------------------------------------------------
// Table: user_profiles — Public identity anchor for NextAuth users
// ---------------------------------------------------------------------------

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey(),
    oauthProvider: text('oauth_provider').notNull(),
    oauthSub: text('oauth_sub').notNull(),
    email: text('email').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_profiles_provider_sub_idx').on(table.oauthProvider, table.oauthSub),
  ]
)

// ---------------------------------------------------------------------------
// Table: learnings — Core knowledge node (Layer 0 atom)
// ---------------------------------------------------------------------------

export const learnings = pgTable(
  'learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    // Note: FK to auth.users is enforced in migration SQL, not Drizzle FK ref,
    // because drizzle-kit snapshot diffing with cross-schema FKs is unreliable.
    teamId: uuid('team_id'),
    content: text('content').notNull(),
    type: text('type').notNull(),
    confidenceBase: doublePrecision('confidence_base').notNull().default(0.5),
    confidence: doublePrecision('confidence').notNull().default(0.5),
    extractionMethod: text('extraction_method').notNull(),
    sourceConversationId: uuid('source_conversation_id'),
    // Lineage: set when this learning was created by refining (merging with) a near-duplicate.
    // The referenced learning remains active and decays naturally — this is provenance, not supersession.
    // Nullable self-FK intentionally omitted from drizzle reference() to avoid cross-schema snapshot issues.
    refinedFrom: uuid('refined_from'),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    mutedAt: timestamp('muted_at', { withTimezone: true }),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
    sourceApp: text('source_app'),  // FK-lite to conductor_apps.slug; null = core
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('learnings_user_id_idx').on(table.userId),
    index('learnings_team_id_idx').on(table.teamId),
    index('learnings_confidence_idx').on(table.confidence),
    index('learnings_type_idx').on(table.type),
    check('confidence_invariant', sql`${table.confidence} <= ${table.confidenceBase}`),
    check('confidence_range', sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
    check('confidence_base_range', sql`${table.confidenceBase} >= 0 AND ${table.confidenceBase} <= 1`),
  ]
)

// ---------------------------------------------------------------------------
// Table: embeddings_1536 — Cloud embeddings (OpenAI text-embedding-3-*)
// ---------------------------------------------------------------------------

export const embeddings1536 = pgTable('embeddings_1536', {
  learningId: uuid('learning_id').primaryKey().references(() => learnings.id, { onDelete: 'cascade' }),
  embedding: vector1536('embedding').notNull(),
  modelName: text('model_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: embeddings_384 — Local embeddings (sovereignty-safe, Ollama / SentenceTransformers)
// ---------------------------------------------------------------------------

export const embeddings384 = pgTable('embeddings_384', {
  learningId: uuid('learning_id').primaryKey().references(() => learnings.id, { onDelete: 'cascade' }),
  embedding: vector384('embedding').notNull(),
  modelName: text('model_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: learning_scopes — Many-to-many scope tags
// ---------------------------------------------------------------------------

export const learningScopes = pgTable(
  'learning_scopes',
  {
    learningId: uuid('learning_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.learningId, table.scope] }),
    index('learning_scopes_scope_idx').on(table.scope),
    index('learning_scopes_learning_idx').on(table.learningId),
  ]
)

// ---------------------------------------------------------------------------
// Table: learning_links — Zettelkasten directed edges
// ---------------------------------------------------------------------------

export const learningLinks = pgTable(
  'learning_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    linkType: text('link_type').notNull(),
    strength: doublePrecision('strength').notNull().default(0.5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('no_self_link', sql`${table.sourceId} != ${table.targetId}`),
  ]
)

// ---------------------------------------------------------------------------
// Table: cooccurrence — Usage cohort (which learnings appear together)
// ---------------------------------------------------------------------------

export const cooccurrence = pgTable(
  'cooccurrence',
  {
    learningA: uuid('learning_a').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    learningB: uuid('learning_b').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
    count: integer('count').notNull().default(1),
    positiveCount: integer('positive_count').notNull().default(0),
    negativeCount: integer('negative_count').notNull().default(0),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.learningA, table.learningB] }),
    check('ordered_pair', sql`${table.learningA} < ${table.learningB}`),
  ]
)

// ---------------------------------------------------------------------------
// Table: feedback — All feedback signals (all 4 source types)
// ---------------------------------------------------------------------------

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    learningId: uuid('learning_id').references(() => learnings.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    injectionId: uuid('injection_id'),
    signal: text('signal').notNull(),
    source: text('source').notNull(),
    processed: boolean('processed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_user_unprocessed_idx').on(table.userId, table.processed),
  ]
)

// ---------------------------------------------------------------------------
// Table: projects — UI-level saved scope filters (not containers)
// ---------------------------------------------------------------------------

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  teamId: uuid('team_id'),
  name: text('name').notNull(),
  scopeFilter: jsonb('scope_filter').notNull().default(sql`'{"include":[],"exclude":[]}'::jsonb`),
  domainClusterId: uuid('domain_cluster_id'),
  crossLensAccess: boolean('cross_lens_access').notNull().default(false),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: domain_seeds — System-shipped type/weight hints for domain signals
// ---------------------------------------------------------------------------

export const domainSeeds = pgTable('domain_seeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  signalKeywords: jsonb('signal_keywords').notNull(),
  preferredTypes: jsonb('preferred_types').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
})

// ---------------------------------------------------------------------------
// Table: domain_clusters — Emergent clusters from scope tag co-occurrence
// ---------------------------------------------------------------------------

export const domainClusters = pgTable('domain_clusters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  label: text('label').notNull(),
  scopeTags: jsonb('scope_tags').notNull(),
  centroid1536: vector1536('centroid_1536'),
  centroid384: vector384('centroid_384'),
  confidence: doublePrecision('confidence').notNull().default(0.5),
  learningCount: integer('learning_count').notNull().default(0),
  lastRecomputed: timestamp('last_recomputed', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: injection_audit — Full injection decision log
// ---------------------------------------------------------------------------

export const injectionAudit = pgTable(
  'injection_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    conversationId: uuid('conversation_id'),
    learningId: uuid('learning_id').references(() => learnings.id, { onDelete: 'set null' }),
    included: boolean('included').notNull(),
    score: doublePrecision('score').notNull(),
    reason: text('reason'),
    excludeReason: text('exclude_reason'),
    tierUsed: integer('tier_used').notNull(),
    tokensUsed: integer('tokens_used'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('injection_audit_user_time_idx').on(table.userId, table.createdAt),
  ]
)

// ---------------------------------------------------------------------------
// Table: conductor_queue — Background job queue
// ---------------------------------------------------------------------------

export const conductorQueue = pgTable(
  'conductor_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conductor_queue_pending_idx').on(table.userId, table.status),
    index('conductor_queue_locked_idx').on(table.lockedAt),
  ]
)

// ---------------------------------------------------------------------------
// Table: conductor_proposals — Pending confidence adjustments (human approval required)
// ---------------------------------------------------------------------------

export const conductorProposals = pgTable('conductor_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  learningId: uuid('learning_id').references(() => learnings.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  confidenceDelta: doublePrecision('confidence_delta').notNull(),
  rationale: text('rationale').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(true),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: api_tokens — MCP Bearer tokens
// ---------------------------------------------------------------------------

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    hashedToken: text('hashed_token').notNull().unique(),
    scopes: jsonb('scopes').notNull().default(sql`'[]'::jsonb`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_tokens_active_idx').on(table.hashedToken),
  ]
)

// ---------------------------------------------------------------------------
// Table: mobile_auth_codes — one-time short-lived code -> bearer token exchange
// ---------------------------------------------------------------------------

export const mobileAuthCodes = pgTable(
  'mobile_auth_codes',
  {
    code: text('code').primaryKey(),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
  },
  (table) => [
    index('mobile_auth_codes_expiry').on(table.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// Table: provider_configs — Per-user LLM provider API keys + preferences
// ---------------------------------------------------------------------------

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    provider: text('provider').notNull(),
    apiKeyEnc: text('api_key_enc').notNull(),
    modelOverride: text('model_override'),
    baseUrl: text('base_url'),
    isLocal: boolean('is_local').notNull().default(false),
    isEnabled: boolean('is_enabled').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('provider_configs_user_provider_idx').on(table.userId, table.provider),
    index('provider_configs_user_idx').on(table.userId),
    index('provider_configs_lookup_idx').on(table.userId, table.isEnabled, table.priority),
  ],
)

// ---------------------------------------------------------------------------
// Table: personas — System + user-defined agent personas
// ---------------------------------------------------------------------------

export const personas = pgTable(
  'personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    systemPrompt: text('system_prompt').notNull(),
    defaultProvider: text('default_provider'),
    defaultModel: text('default_model'),
    temperature: doublePrecision('temperature').notNull().default(0.7),
    maxTokens: integer('max_tokens').notNull().default(4096),
    scopeFilter: jsonb('scope_filter').notNull().default(
      sql`'{"include":[],"exclude":[],"boost":[]}'::jsonb`,
    ),
    allowedTools: jsonb('allowed_tools').notNull().default(sql`'[]'::jsonb`),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    // 'thinking' | 'balanced' | 'fast' — null means balanced (default)
    tier: text('tier'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('personas_user_idx').on(table.userId),
    index('personas_system_idx').on(table.isSystem),
  ],
)
// ---------------------------------------------------------------------------
// Table: user_settings — Conductor and app settings for the user
// ---------------------------------------------------------------------------

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().references(() => userProfiles.id, { onDelete: 'cascade' }),
  endOfSessionJudgeEnabled: boolean('end_of_session_judge_enabled').notNull().default(false),
  customization: jsonb('customization').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Table: conductor_apps — Connected app registry for the Conductor
// ---------------------------------------------------------------------------

export const conductorApps = pgTable('conductor_apps', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  apiKeyHash: text('api_key_hash'),
  ownerId: uuid('owner_id'),   // NULL = system-owned (visible to all users)
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastWriteAt: timestamp('last_write_at', { withTimezone: true }),
})

// ---------------------------------------------------------------------------
// Table: conversations — Active session records for MCP memory loop
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    sessionId: text('session_id'),
    scopeTags: jsonb('scope_tags').notNull().default(sql`'[]'::jsonb`),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    messageCount: integer('message_count').notNull().default(0),
    learningsExtracted: integer('learnings_extracted').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('conversations_user_id_idx').on(table.userId),
    index('conversations_started_at_idx').on(table.userId, table.startedAt),
    index('conversations_project_id_idx').on(table.projectId),
  ],
)
