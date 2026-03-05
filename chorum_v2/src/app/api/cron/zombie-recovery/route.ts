// src/app/api/cron/zombie-recovery/route.ts
// Queue zombie recovery — Vercel Cron every 5 minutes.
// Resets conductor_queue items stuck in 'processing' for > 10 minutes.

import { NextResponse } from 'next/server'
import { recoverZombies } from '@/lib/core/conductor/queue'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
    if (!CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const recovered = await recoverZombies()
        return NextResponse.json({ recovered, timestamp: new Date().toISOString() })
    } catch (err) {
        console.error('[zombie-recovery] Error:', err)
        return NextResponse.json({ error: 'Recovery failed' }, { status: 500 })
    }
}
