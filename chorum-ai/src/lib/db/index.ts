import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
}

// Configure postgres-js for Supabase connection pooler (Supavisor)
const client = postgres(connectionString, {
    prepare: false, // Required for Supabase connection pooler in transaction mode
})
export const db = drizzle(client, { schema })
