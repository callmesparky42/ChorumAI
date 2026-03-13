// src/db/health.ts
// Drizzle client for the dedicated health Supabase project.
// Points at HEALTH_DATABASE_URL — NEVER at DATABASE_URL.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as healthSchema from './health-schema'

const connectionString = process.env.HEALTH_DATABASE_URL

if (!connectionString) {
  throw new Error('HEALTH_DATABASE_URL is not set. Health routes cannot start.')
}

const client = postgres(connectionString, { prepare: false })

export const healthDb = drizzle(client, { schema: healthSchema })
export type HealthDB = typeof healthDb
