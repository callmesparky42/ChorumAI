// src/app/api/cron/process-queue/route.ts
// Conductor queue processor — Vercel Cron every 2 minutes.
// Drains pending conductor_queue items (signal processing, lm_judge, compaction).
// Each invocation processes up to BATCH_SIZE items across all users.

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { conductorQueue } from '@/db/schema'
import { eq, and, lt, inArray, sql } from 'drizzle-orm'
import { createNebula } from '@/lib/nebula'
import { createConductor } from '@/lib/core/conductor'
import type { ConductorSignal } from '@/lib/core'

const CRON_SECRET = process.env.CRON_SECRET
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 3

export async function GET(request: Request) {
    if (!CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const nebula = createNebula()
        const conductor = createConductor(nebula)

        // Step 1: Select a batch of pending item IDs.
        // Drizzle update() does not support .limit(), so we select first then update by IDs.
        const pendingRows = await db
            .select({ id: conductorQueue.id, type: conductorQueue.type, payload: conductorQueue.payload })
            .from(conductorQueue)
            .where(
                and(
                    eq(conductorQueue.status, 'pending'),
                    lt(conductorQueue.attempts, MAX_ATTEMPTS),
                )
            )
            .limit(BATCH_SIZE)

        if (pendingRows.length === 0) {
            return NextResponse.json({
                processed: 0,
                failed: 0,
                batchSize: 0,
                timestamp: new Date().toISOString(),
            })
        }

        const ids = pendingRows.map((r) => r.id)
        const now = new Date()

        // Step 2: Claim the batch atomically (pending → processing).
        await db
            .update(conductorQueue)
            .set({ status: 'processing', lockedAt: now })
            .where(inArray(conductorQueue.id, ids))

        let processed = 0
        let failed = 0

        for (const job of pendingRows) {
            try {
                if (job.type === 'signal_processing') {
                    // Payload is a ConductorSignal — reconstruct and dispatch
                    const raw = job.payload as unknown as ConductorSignal
                    const signal: ConductorSignal = {
                        ...raw,
                        timestamp: new Date(raw.timestamp), // deserialize serialized Date
                    }
                    await conductor.submitSignal(signal)
                }
                // lm_judge and compaction are Phase 5+ — mark complete without processing
                await db
                    .update(conductorQueue)
                    .set({ status: 'completed' })
                    .where(eq(conductorQueue.id, job.id))
                processed++
            } catch (err) {
                console.error(`[process-queue] Job ${job.id} (${job.type}) failed:`, err)
                // Return to pending for retry; zombie-recovery cron will reset lockedAt
                await db
                    .update(conductorQueue)
                    .set({
                        status: 'pending',
                        lockedAt: null,
                        attempts: sql`${conductorQueue.attempts} + 1`,
                    })
                    .where(eq(conductorQueue.id, job.id))
                failed++
            }
        }

        return NextResponse.json({
            processed,
            failed,
            batchSize: pendingRows.length,
            timestamp: new Date().toISOString(),
        })
    } catch (err) {
        console.error('[process-queue] Error:', err)
        return NextResponse.json({ error: 'Queue processing failed' }, { status: 500 })
    }
}
