import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export async function GET() {
    try {
        // User table columns
        await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bio" text`)
        await db.execute(sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "security_settings" jsonb`)

        // Provider credentials columns (for BYO LLM support)
        await db.execute(sql`ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "base_url" text`)
        await db.execute(sql`ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "is_local" boolean DEFAULT false`)
        await db.execute(sql`ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "display_name" text`)

        return NextResponse.json({
            success: true,
            message: 'Database schema updated: user (bio, security_settings), provider_credentials (base_url, is_local, display_name)'
        })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
