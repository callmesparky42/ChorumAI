// src/db/health.ts
// Drizzle client for the dedicated health Supabase project.
// Points at HEALTH_DATABASE_URL — NEVER at DATABASE_URL.
//
// Initialization is lazy so that importing this module at build time does not
// throw when HEALTH_DATABASE_URL is absent (e.g. next build on Vercel).
// The error is deferred until the first actual DB call at request time.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as healthSchema from './health-schema'

type HealthDB = ReturnType<typeof drizzle<typeof healthSchema>>

function createClient(): HealthDB {
  const connectionString = process.env.HEALTH_DATABASE_URL
  if (!connectionString) {
    throw new Error('HEALTH_DATABASE_URL is not set. Health routes cannot start.')
  }
  return drizzle(postgres(connectionString, { prepare: false }), { schema: healthSchema })
}

let _db: HealthDB | null = null

export const healthDb = new Proxy({} as HealthDB, {
  get(_target, prop, receiver) {
    if (!_db) _db = createClient()
    return Reflect.get(_db, prop, receiver)
  },
})

export type { HealthDB }
