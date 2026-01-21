import { pgTable, text, uuid, timestamp, decimal, integer, jsonb, boolean, primaryKey } from 'drizzle-orm/pg-core'
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
  }>(),
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
      .references(() => users.id, { onDelete: "cascade" }),
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
    .references(() => users.id, { onDelete: "cascade" }),
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
      .references(() => users.id, { onDelete: "cascade" }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'google' | 'mistral' | 'deepseek' | 'perplexity' | 'xai' | 'glm' | 'ollama' | 'lmstudio' | 'openai-compatible'
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  model: text('model').notNull(),
  dailyBudget: decimal('daily_budget', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  capabilities: jsonb('capabilities').$type<string[]>(),
  costPer1M: jsonb('cost_per_1m').$type<{ input: number; output: number }>(),
  baseUrl: text('base_url'), // Custom endpoint URL (e.g., http://localhost:11434 for Ollama)
  isLocal: boolean('is_local').default(false), // Local vs cloud provider
  displayName: text('display_name') // User-friendly name (e.g., "My Local Phi-3")
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  techStack: jsonb('tech_stack').$type<string[]>(),
  customInstructions: text('custom_instructions'),
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
  images: jsonb('images').$type<string[]>(), // Array of base64 image strings or URLs
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  createdAt: timestamp('created_at').defaultNow()
})

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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  config: jsonb('config').$type<AgentDefinition>().notNull(), // Full AgentDefinition from types.ts
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})
