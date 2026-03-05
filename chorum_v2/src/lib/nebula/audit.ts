// src/lib/nebula/audit.ts
import { db } from '@/db'
import { injectionAudit } from '@/db/schema'
import type { InjectionAuditEntry } from './types'

export async function logInjectionAudit(
  entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[],
): Promise<void> {
  if (entries.length === 0) return

  await db.insert(injectionAudit).values(
    entries.map((e) => ({
      userId:         e.userId,
      conversationId: e.conversationId ?? null,
      learningId:     e.learningId ?? null,
      included:       e.included,
      score:          e.score,
      reason:         e.reason ?? null,
      excludeReason:  e.excludeReason ?? null,
      tierUsed:       e.tierUsed,
      tokensUsed:     e.tokensUsed ?? null,
    }))
  )
}