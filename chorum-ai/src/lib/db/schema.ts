import { pgTable, text, uuid, timestamp, decimal, integer, jsonb, boolean, primaryKey } from 'drizzle-orm/pg-core'
import type { AdapterAccount } from "next-auth/adapters"

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
  createdAt: timestamp('created_at').defaultNow()
})

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
  provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'google' | 'mistral' | 'deepseek' | 'ollama' | 'openai-compatible'
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

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
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

