import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { DatabaseTestResult } from '@/lib/onboarding/types'

/**
 * POST /api/onboarding/test-connection
 *
 * Tests the database connection by running a simple query.
 * Returns connection status, latency, and PostgreSQL version.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = performance.now()

    // Test connection with a simple query
    const result = await db.execute(sql`SELECT version() as version`)
    const endTime = performance.now()
    const latencyMs = Math.round(endTime - startTime)

    // Extract version info
    const versionRow = result[0] as { version: string } | undefined
    const version = versionRow?.version ?? 'Unknown'

    // Parse PostgreSQL version (e.g., "PostgreSQL 15.4 (Ubuntu 15.4-1.pgdg22.04+1) on x86_64...")
    const versionMatch = version.match(/PostgreSQL (\d+\.\d+)/)
    const shortVersion = versionMatch ? `PostgreSQL ${versionMatch[1]}` : version.split(' ').slice(0, 2).join(' ')

    const response: DatabaseTestResult = {
      success: true,
      latencyMs,
      version: shortVersion,
      details: `Connected successfully in ${latencyMs}ms`,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Database connection test error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Provide helpful error messages
    let details = 'Failed to connect to database'
    if (errorMessage.includes('ECONNREFUSED')) {
      details = 'Connection refused. Is PostgreSQL running?'
    } else if (errorMessage.includes('authentication failed')) {
      details = 'Authentication failed. Check your username and password.'
    } else if (errorMessage.includes('does not exist')) {
      details = 'Database does not exist. Create it first.'
    } else if (errorMessage.includes('ENOTFOUND')) {
      details = 'Host not found. Check your DATABASE_URL hostname.'
    }

    const response: DatabaseTestResult = {
      success: false,
      latencyMs: 0,
      error: errorMessage,
      details,
    }

    return NextResponse.json(response)
  }
}
