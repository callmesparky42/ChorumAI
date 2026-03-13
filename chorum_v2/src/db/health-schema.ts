// src/db/health-schema.ts
// Health table definitions for the dedicated health Supabase project.
// IMPORTANT: Keep this isolated from src/db/schema.ts (core database).

import {
  pgTable,
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core'

const authSchema = pgSchema('auth')
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// ---------------------------------------------------------------------------
// health_snapshots — append-only encrypted PHI store
// ---------------------------------------------------------------------------

export const healthSnapshots = pgTable('health_snapshots', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  type:             text('type').notNull(),          // HealthSnapshotType
  recordedAt:       timestamp('recorded_at', { withTimezone: true }).notNull(),
  source:           text('source').notNull(),         // HealthSnapshotSource
  encryptedPayload: text('encrypted_payload').notNull(),  // AES-256-GCM ciphertext
  payloadIv:        text('payload_iv').notNull(),
  payloadHash:      text('payload_hash').notNull(),   // SHA-256 for dedup
  storagePath:      text('storage_path'),             // Supabase Storage path if file attached
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// health_sources — trusted medical knowledge registry
// ---------------------------------------------------------------------------

export const healthSources = pgTable('health_sources', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  baseUrl:    text('base_url').notNull(),
  domain:     text('domain').notNull(),    // 'cardiology' | 'labs' | 'general' | etc.
  trustLevel: integer('trust_level').notNull().default(1),
  active:     boolean('active').notNull().default(true),
})

// ---------------------------------------------------------------------------
// phi_audit_log — HIPAA required access log
// ---------------------------------------------------------------------------

export const phiAuditLog = pgTable('phi_audit_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  actorId:      text('actor_id').notNull(),      // uuid string or 'system'
  action:       text('action').notNull(),         // 'view' | 'create' | 'export' | 'decrypt' | 'delete' | 'integrity_failure'
  resourceType: text('resource_type').notNull(),  // 'snapshot' | 'trend' | 'report'
  resourceId:   uuid('resource_id'),
  ipAddress:    text('ip_address'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// garmin_sync_state — credentials + sync cursor + circuit breaker
// ---------------------------------------------------------------------------

export const garminSyncState = pgTable('garmin_sync_state', {
  userId:              uuid('user_id').primaryKey(),
  encryptedUsername:   text('encrypted_username').notNull(),
  encryptedPassword:   text('encrypted_password').notNull(),
  credsIv:             text('creds_iv').notNull(),    // 'usernameIv:passwordIv'
  lastSyncAt:          timestamp('last_sync_at', { withTimezone: true }),
  syncCursor:          text('sync_cursor'),            // last fetched date marker
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  circuitOpen:         boolean('circuit_open').notNull().default(false),
  circuitOpenedAt:     timestamp('circuit_opened_at', { withTimezone: true }),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// health_user_settings — per-user preferences (non-credential, non-snapshot)
// Kept separate from garmin_sync_state to avoid mixing credential columns
// with settings columns that must be writable before Garmin is connected.
// ---------------------------------------------------------------------------

export const healthUserSettings = pgTable('health_user_settings', {
  userId:          uuid('user_id').primaryKey(),
  retentionDays:   integer('retention_days').notNull().default(0),  // 0 = keep forever
  alertThresholds: text('alert_thresholds'),  // JSON: AlertThresholds from alert-evaluator.ts
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// push_tokens — Expo push notification device tokens (Phase 5 delivery)
// ---------------------------------------------------------------------------

export const pushTokens = pgTable('push_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  token:     text('token').notNull().unique(),
  platform:  text('platform').notNull().default('android'),  // 'android' | 'ios'
  active:    boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
