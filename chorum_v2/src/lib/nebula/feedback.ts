// src/lib/nebula/feedback.ts
import { db } from '@/db'
import { feedback } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import type { Feedback, SignalSource, SignalValue } from './types'
import type { FeedbackInput } from './interface'

function rowToFeedback(row: typeof feedback.$inferSelect): Feedback {
  return {
    id:             row.id,
    userId:         row.userId,
    learningId:     row.learningId ?? null,
    conversationId: row.conversationId ?? null,
    injectionId:    row.injectionId ?? null,
    signal:         row.signal as SignalValue,
    source:         row.source as SignalSource,
    processed:      row.processed,
    createdAt:      row.createdAt,
  }
}

export async function recordFeedback(input: FeedbackInput): Promise<void> {
  await db.insert(feedback).values({
    userId:         input.userId,
    learningId:     input.learningId ?? null,
    conversationId: input.conversationId ?? null,
    injectionId:    input.injectionId ?? null,
    signal:         input.signal,
    source:         input.source,
    processed:      false,
  })
}

export async function getPendingFeedback(userId: string): Promise<Feedback[]> {
  const rows = await db
    .select()
    .from(feedback)
    .where(and(eq(feedback.userId, userId), eq(feedback.processed, false)))

  return rows.map(rowToFeedback)
}

export async function markFeedbackProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.update(feedback).set({ processed: true }).where(inArray(feedback.id, ids))
}