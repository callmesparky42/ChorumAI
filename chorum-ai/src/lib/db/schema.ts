import { pgTable, text, uuid, timestamp, decimal, integer, jsonb, boolean, primaryKey, vector, unique, index } from 'drizzle-orm/pg-core'
import type { AdapterAccount } from "next-auth/adapters"
import type { AgentDefinition } from '@/lib/agents/types'

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  bio: text('bio'),
  securitySettings: jsonb('security_settings').$type<{
    enforceHttps: boolean
    anonymizePii: boolean
    strictSsl: boolean
    logAllRequests: boolean
  }>(),
  fallbackSettings: jsonb('fallback_settings').$type<{
    enabled: boolean
    defaultProvider: string | null  // Provider to prefer when things break (e.g., 'anthropic')
    localFallbackModel: string | null  // Ollama model to use as offline fallback
    priorityOrder: string[]  // Custom fallback order
  }>(),
  memorySettings: jsonb('memory_settings').$type<{
    autoLearn: boolean            // Extract patterns from conversations
    learningMode: 'sync' | 'async' // Processing mode
    injectContext: boolean        // Inject learned patterns into prompts
    autoSummarize: boolean        // Auto-summarize old conversations
    validateResponses: boolean    // Check against invariants
    smartAgentRouting: boolean    // Auto-select agent per message
    // Search settings
    search?: {
      enabled: boolean
      provider: 'serper'
      autoSearch: boolean
    }
  }>(),
  // Third-party API keys (encrypted)
  serperApiKeyEncrypted: text('serper_api_key_encrypted'),
  // Conductor's Podium settings
  conductorDetailedView: boolean('conductor_detailed_view').default(false), // Show detailed scores in ConductorTrace
  // Onboarding tracking
  onboardingCompleted: boolean('onboarding_completed').default(false),
  onboardingStep: integer('onboarding_step').default(0), // 0=not started, 1-5=in progress, 6=complete
  onboardingData: jsonb('onboarding_data').$type<OnboardingData>(),
  createdAt: timestamp('created_at').defaultNow()
})

// Onboarding data shape stored in users.onboardingData
export type OnboardingData = {
  // Step completion tracking
  completedSteps: ('welcome' | 'environment' | 'database' | 'providers' | 'preferences')[]

  // Environment setup (step 2)
  envConfigured: boolean
  envValidatedAt?: string // ISO timestamp

  // Database connection (step 3)
  databaseConnected: boolean
  databaseTestedAt?: string

  // Providers (step 4)
  providersConfigured: string[] // List of provider names added
  primaryProvider?: string

  // Preferences (step 5)
  preferencesSet: boolean

  // Metadata
  startedAt: string
  completedAt?: string
  setupSource: 'wizard' | 'cli' | 'manual'
}

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => ({
    compositePK: primaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  })
)

export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'google' | 'mistral' | 'deepseek' | 'perplexity' | 'xai' | 'glm' | 'ollama' | 'lmstudio' | 'openai-compatible'
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  model: text('model').notNull(),
  dailyBudget: decimal('daily_budget', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  capabilities: jsonb('capabilities').$type<string[]>(),
  costPer1M: jsonb('cost_per_1m').$type<{ input: number; output: number }>(),
  baseUrl: text('base_url'), // Custom endpoint URL (e.g., http://localhost:11434 for Ollama)
  isLocal: boolean('is_local').default(false), // Local vs cloud provider
  displayName: text('display_name'), // User-friendly name (e.g., "My Local Phi-3")
  contextWindow: integer('context_window') // User override for model context window
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  techStack: jsonb('tech_stack').$type<string[]>(),
  customInstructions: text('custom_instructions'),
  // Conductor's Podium settings
  conductorLens: decimal('conductor_lens', { precision: 3, scale: 2 }).default('1.00'), // 0.25 to 2.00 budget multiplier
  focusDomains: jsonb('focus_domains').$type<string[]>().default([]),
  domainSignal: jsonb('domain_signal').$type<{
    primary: string
    domains: { domain: string; confidence: number; evidence: number }[]
    conversationsAnalyzed: number
    computedAt: string  // ISO timestamp
  }>(),
  createdAt: timestamp('created_at').defaultNow()
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title'), // AI-generated title from first message (null until generated)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }), // Nullable for backward compat
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  images: jsonb('images').$type<string[]>(), // Array of base64 image strings or URLs (Legacy)
  attachments: jsonb('attachments').$type<{
    type: 'image' | 'text' | 'code' | 'markdown' | 'json' | 'pdf';
    name: string;
    content: string;
    mimeType: string;
  }[]>(), // New structured attachments
  provider: text('provider'), // Which LLM answered (null for user messages)
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  isArchived: boolean('is_archived').default(false), // For memory cleanup
  createdAt: timestamp('created_at').defaultNow()
})

export const memorySummaries = pgTable('memory_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  messageCount: integer('message_count').notNull(),
  fromDate: timestamp('from_date').notNull(),
  toDate: timestamp('to_date').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

export const routingLog = pgTable('routing_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  taskType: text('task_type'), // Inferred or explicit
  selectedProvider: text('selected_provider').notNull(),
  reasoning: text('reasoning'),
  alternatives: jsonb('alternatives').$type<{ provider: string; cost: number }[]>(),
  userOverride: boolean('user_override').default(false),
  createdAt: timestamp('created_at').defaultNow()
})

export const usageLog = pgTable('usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  provider: text('provider').notNull(),
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).notNull(),
  tokensInput: integer('tokens_input').notNull(),
  tokensOutput: integer('tokens_output').notNull(),
  date: timestamp('date').notNull().defaultNow()
})

// --- Learning System Tables ---

export const projectLearningPaths = pgTable('project_learning_paths', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'pattern' | 'antipattern' | 'decision' | 'invariant' | 'golden_path'
  content: text('content').notNull(),
  context: text('context'), // Trigger/Description
  metadata: jsonb('metadata'), // e.g. { source_message_id: "...", learned_from_user: "..." }
  source: text('source').default('web-ui'), // 'web-ui' | 'claude-code' | 'cursor' | 'h4x0r' | etc.

  // Relevance Gating Fields
  embedding: vector('embedding', { dimensions: 384 }), // vector(384) for all-MiniLM-L6-v2
  domains: jsonb('domains').$type<string[]>().default([]),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: timestamp('last_used_at'),
  promotedAt: timestamp('promoted_at'), // Set when usage exceeds promotion threshold
  // Conductor's Podium: pin/mute controls
  pinnedAt: timestamp('pinned_at'), // User pinned this item - always include in context
  mutedAt: timestamp('muted_at'),   // User muted this item - never include in context

  createdAt: timestamp('created_at').defaultNow()
})

export const learningContextCache = pgTable('learning_context_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  tier: integer('tier').notNull(),
  compiledContext: text('compiled_context').notNull(),
  tokenEstimate: integer('token_estimate').notNull(),
  learningCount: integer('learning_count').default(0),
  invariantCount: integer('invariant_count').default(0),
  compiledAt: timestamp('compiled_at').defaultNow(),
  invalidatedAt: timestamp('invalidated_at'),
  compilerModel: text('compiler_model'),
}, (t) => ({
  unqProjectTier: unique('learning_cache_project_tier_unq').on(t.projectId, t.tier),
  idxProject: index('idx_learning_cache_project').on(t.projectId),
}))

export const projectConfidence = pgTable('project_confidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  score: decimal('score', { precision: 5, scale: 2 }).default('100.00'), // 0-100
  decayRate: decimal('decay_rate', { precision: 5, scale: 4 }).default('0.9900'), // Daily decay multiplier
  lastDecayAt: timestamp('last_decay_at').defaultNow(),
  interactionCount: integer('interaction_count').default(0),
  positiveInteractionCount: integer('positive_interaction_count').default(0),
  updatedAt: timestamp('updated_at').defaultNow()
})

export const projectFileMetadata = pgTable('project_file_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(), // Relative path
  isCritical: boolean('is_critical').default(false), // Tier A file
  linkedInvariants: jsonb('linked_invariants').$type<string[]>(), // IDs of invariants
  updatedAt: timestamp('updated_at').defaultNow()
})

// --- Security Audit Logs ---

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  action: text('action').notNull(), // 'LLM_REQUEST' | 'SECURITY_CHECK' | etc.
  provider: text('provider'),
  endpoint: text('endpoint'),
  model: text('model'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  securityFlags: jsonb('security_flags').$type<{
    httpsEnforced?: boolean
    piiAnonymized?: boolean
    sslValidated?: boolean
  }>(),
  createdAt: timestamp('created_at').defaultNow()
})

// --- Learning Queue for Async Processing ---

export const learningQueue = pgTable('learning_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userMessage: text('user_message').notNull(),
  assistantResponse: text('assistant_response').notNull(),
  agentName: text('agent_name'),
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  attempts: integer('attempts').default(0),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at')
})
// --- Custom Agents ---

export const customAgents = pgTable('custom_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  config: jsonb('config').$type<AgentDefinition>().notNull(), // Full AgentDefinition from types.ts
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

// --- Zettelkasten Graph Tables ---

export const learningLinks = pgTable('learning_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fromId: uuid('from_id').notNull().references(() => projectLearningPaths.id, { onDelete: 'cascade' }),
  toId: uuid('to_id').notNull().references(() => projectLearningPaths.id, { onDelete: 'cascade' }),
  linkType: text('link_type').notNull(), // 'supports' | 'contradicts' | 'supersedes' | 'protects'
  strength: decimal('strength', { precision: 3, scale: 2 }).default('0.5'), // 0.00 to 1.00
  source: text('source').default('inferred'), // 'inferred' | 'co-occurrence' | 'user'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (t) => ({
  unqLink: unique('learning_links_unq').on(t.fromId, t.toId, t.linkType)
}))

export const learningCooccurrence = pgTable('learning_cooccurrence', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  itemA: uuid('item_a').notNull().references(() => projectLearningPaths.id, { onDelete: 'cascade' }),
  itemB: uuid('item_b').notNull().references(() => projectLearningPaths.id, { onDelete: 'cascade' }),
  count: integer('count').default(1),
  positiveCount: integer('positive_count').default(0),
  lastSeen: timestamp('last_seen').defaultNow()
}, (t) => ({
  unqCooccurrence: unique('learning_cooccurrence_unq').on(t.itemA, t.itemB)
}))

// --- MCP Server Mode Tables ---

// API Tokens for MCP authentication
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  token: text('token').notNull().unique(), // Format: chorum_xxxxxxxxxxxx
  name: text('name').default('Default'), // User-friendly label
  permissions: jsonb('permissions').$type<{
    read: boolean
    write: boolean
    projects: string[] | 'all' // Specific project IDs or 'all'
  }>().default({ read: true, write: true, projects: 'all' }),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'), // null = never expires
  createdAt: timestamp('created_at').defaultNow(),
  revokedAt: timestamp('revoked_at')
})

// Pending learnings queue (human-in-the-loop for writes)
export const pendingLearnings = pgTable('pending_learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  type: text('type').notNull(), // 'pattern' | 'antipattern' | 'decision' | 'invariant' | 'goldenPath'
  content: text('content').notNull(),
  context: text('context'),
  source: text('source').notNull(), // 'claude-code' | 'cursor' | 'windsurf' | 'h4x0r' | 'web-ui'
  sourceMetadata: jsonb('source_metadata').$type<{
    agentVersion?: string
    sessionId?: string
    conversationId?: string
  }>(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied'
  reviewedAt: timestamp('reviewed_at'),
  reviewerNotes: text('reviewer_notes'),
  createdAt: timestamp('created_at').defaultNow()
})

// MCP interaction log for confidence scoring
export const mcpInteractionLog = pgTable('mcp_interaction_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  source: text('source').notNull(), // 'claude-code' | 'cursor' | etc.
  toolName: text('tool_name').notNull(), // 'query_memory' | 'get_invariants' | etc.
  queryType: text('query_type'), // 'trivial' | 'moderate' | 'complex' | 'critical'
  tokensReturned: integer('tokens_returned'),
  itemsReturned: integer('items_returned'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at').defaultNow()
})

// --- Project Documents (File Upload Consent Gate) ---

// Stores persistent documents uploaded to projects (non-ephemeral)
export const projectDocuments = pgTable('project_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  contentHash: text('content_hash').notNull(),
  content: text('content').notNull(),
  mimeType: text('mime_type').notNull(),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  extractedLearningIds: jsonb('extracted_learning_ids').$type<string[]>().default([]),
  status: text('status').notNull().default('active'), // 'active' | 'archived'
  metadata: jsonb('metadata').$type<{ originalSize?: number; conversationId?: string }>()
}, (t) => ({
  unqProjectHash: unique('project_documents_project_hash').on(t.projectId, t.contentHash)
}))

// --- External MCP Client Configuration ---

// Stores external MCP servers that the chat interface can use for tool calling
export const mcpServerConfigs = pgTable('mcp_server_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(), // User-friendly name: "Brave Search", "Tavily", etc.
  transportType: text('transport_type').notNull(), // 'stdio' | 'http' | 'sse'

  // For stdio transport (spawns local process)
  command: text('command'), // e.g., "npx"
  args: jsonb('args').$type<string[]>(), // e.g., ["-y", "@anthropic-ai/brave-search-mcp"]
  env: jsonb('env').$type<Record<string, string>>(), // Environment variables (API keys, etc.)

  // For HTTP/SSE transport (remote server)
  url: text('url'), // e.g., "https://my-mcp-server.example.com/mcp"
  headers: jsonb('headers').$type<Record<string, string>>(), // Auth headers

  isEnabled: boolean('is_enabled').default(true),

  // Tool cache (refreshed periodically to avoid constant tool discovery)
  cachedTools: jsonb('cached_tools').$type<{
    name: string
    description?: string
    inputSchema: Record<string, unknown>
  }[]>(),
  lastToolRefresh: timestamp('last_tool_refresh'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})


