import { pgTable, text, uuid, timestamp, decimal, integer, jsonb, vector, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow()
})

export const providerCredentials = pgTable('provider_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'google'
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  model: text('model').notNull(), // 'claude-opus-4' | 'gpt-4' | 'gemini-pro'
  dailyBudget: decimal('daily_budget', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  capabilities: jsonb('capabilities').$type<string[]>(), // ['deep_reasoning', 'code_generation']
  costPer1M: jsonb('cost_per_1m').$type<{ input: number; output: number }>()
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  techStack: jsonb('tech_stack').$type<string[]>(),
  customInstructions: text('custom_instructions'),
  createdAt: timestamp('created_at').defaultNow()
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
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
  projectId: uuid('project_id').notNull().references(() => projects.id),
  summary: text('summary').notNull(),
  messageCount: integer('message_count').notNull(),
  fromDate: timestamp('from_date').notNull(),
  toDate: timestamp('to_date').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

export const routingLog = pgTable('routing_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  projectId: uuid('project_id').references(() => projects.id),
  taskType: text('task_type'), // Inferred or explicit
  selectedProvider: text('selected_provider').notNull(),
  reasoning: text('reasoning'),
  alternatives: jsonb('alternatives').$type<{ provider: string; cost: number }[]>(),
  userOverride: boolean('user_override').default(false),
  createdAt: timestamp('created_at').defaultNow()
})

export const usageLog = pgTable('usage_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).notNull(),
  tokensInput: integer('tokens_input').notNull(),
  tokensOutput: integer('tokens_output').notNull(),
  date: timestamp('date').notNull().defaultNow()
})

