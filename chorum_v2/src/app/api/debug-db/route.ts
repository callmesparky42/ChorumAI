import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
    const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
    
    // Mask the password and show the username/host
    let masked = dbUrl;
    if (dbUrl.includes('@')) {
        const parts = dbUrl.split('@');
        const credentials = parts[0]!.split(':');
        if (credentials.length > 2) {
            masked = `${credentials[0]}:${credentials[1]}:***@${parts[1]}`;
        }
    }

    let dbTestSuccess = false;
    let dbTestError = null;
    let foundTables: string[] = [];

    try {
        // Test connectivity using the actual app's Drizzle instance
        const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        foundTables = res.map((r: any) => r.table_name);
        
        // Explicitly test user_settings
        await db.execute(sql`SELECT * FROM user_settings LIMIT 1`);
        dbTestSuccess = true;
    } catch (e: any) {
        dbTestError = {
            message: e.message,
            code: e.code,
            detail: e.detail
        };
    }

    return NextResponse.json({
        vercelIsRunning: true,
        databaseUrl: masked,
        dbTestSuccess,
        dbTestError,
        tablesVisibleToVercel: foundTables.filter(t => ['user_settings', 'provider_configs', 'personas'].includes(t)),
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    })
}
