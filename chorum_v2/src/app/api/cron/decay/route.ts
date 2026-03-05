// src/app/api/cron/decay/route.ts
// Nightly decay tick — Vercel Cron at 2AM UTC.

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { learnings } from '@/db/schema'
import { isNull, eq } from 'drizzle-orm'
import { computeDecayedConfidence } from '@/lib/core/conductor/decay'
import type { LearningType } from '@/lib/nebula/types'

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
        const BATCH_SIZE = 500
        let offset = 0
        let updated = 0

        while (true) {
            const batch = await db
                .select()
                .from(learnings)
                .where(isNull(learnings.pinnedAt))   // pinned items never decay
                .limit(BATCH_SIZE)
                .offset(offset)

            if (batch.length === 0) break

            for (const row of batch) {
                const newConfidence = computeDecayedConfidence(
                    row.confidenceBase,
                    row.type as LearningType,
                    row.lastUsedAt,
                    row.createdAt,
                    row.pinnedAt,
                )

                // Only write if the value changed (avoid unnecessary writes)
                if (Math.abs(newConfidence - row.confidence) > 0.001) {
                    await db
                        .update(learnings)
                        .set({ confidence: newConfidence })
                        .where(eq(learnings.id, row.id))
                    updated++
                }
            }

            if (batch.length < BATCH_SIZE) break
            offset += BATCH_SIZE
        }

        return NextResponse.json({ updated, timestamp: new Date().toISOString() })
    } catch (err) {
        console.error('[decay-cron] Error:', err)
        return NextResponse.json({ error: 'Decay tick failed' }, { status: 500 })
    }
}
