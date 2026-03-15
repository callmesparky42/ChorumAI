import { NextResponse } from 'next/server'

export async function GET() {
    const dbUrl = process.env.DATABASE_URL || 'NOT_SET';
    
    // Mask the password and show the username/host
    let masked = dbUrl;
    if (dbUrl.includes('@')) {
        const parts = dbUrl.split('@');
        const credentials = parts[0]!.split(':');
        if (credentials.length > 2) {
            // postgresql://user:password -> postgresql://user:***
            masked = `${credentials[0]}:${credentials[1]}:***@${parts[1]}`;
        }
    }

    return NextResponse.json({
        vercelIsRunning: true,
        databaseUrl: masked,
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    })
}
