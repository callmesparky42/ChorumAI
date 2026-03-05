// src/lib/core/conductor/proposals.ts

import { db } from '@/db'
import { conductorProposals } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import type { ConductorProposal, ProposalType } from '../interface'
import { checkGuardrails } from './guardrails'
import type { NebulaInterface } from '@/lib/nebula'
import { NebulaError } from '@/lib/nebula'

const DEFAULT_EXPIRY_DAYS = 7

function rowToProposal(row: typeof conductorProposals.$inferSelect): ConductorProposal {
  return {
    id: row.id,
    type: row.type as ProposalType,
    targetLearningId: row.learningId ?? '',
    confidenceDelta: row.confidenceDelta,
    rationale: row.rationale,
    requiresHumanApproval: row.requiresApproval,
    expiresAt: row.expiresAt ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000),
    createdAt: row.createdAt,
  }
}

export async function createProposal(
  userId: string,
  learningId: string,
  type: ProposalType,
  delta: number,
  rationale: string,
): Promise<ConductorProposal> {
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000)
  const [row] = await db
    .insert(conductorProposals)
    .values({
      userId,
      learningId,
      type,
      confidenceDelta: delta,
      rationale,
      requiresApproval: true,
      status: 'pending',
      expiresAt,
    })
    .returning()

  if (!row) {
    throw new NebulaError('INTERNAL', 'Failed to create conductor proposal')
  }

  return rowToProposal(row)
}

export async function getProposals(userId: string): Promise<ConductorProposal[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(conductorProposals)
    .where(and(eq(conductorProposals.userId, userId), eq(conductorProposals.status, 'pending')))

  return rows.filter((r) => !r.expiresAt || r.expiresAt > now).map(rowToProposal)
}

export async function approveProposal(
  proposalId: string,
  userId: string,
  nebula: NebulaInterface,
): Promise<void> {
  const [row] = await db
    .select()
    .from(conductorProposals)
    .where(and(eq(conductorProposals.id, proposalId), eq(conductorProposals.userId, userId)))

  if (!row || row.status !== 'pending') return

  const learning = row.learningId ? await nebula.getLearning(row.learningId) : null
  if (learning) {
    const result = checkGuardrails({
      learning,
      proposedDelta: row.confidenceDelta,
      isVerified: true,
      requiresApproval: false,
    })
    if (result.allowed) {
      const newBase = result.clampedBase ?? Math.max(0, Math.min(1, learning.confidenceBase + row.confidenceDelta))
      await nebula.updateLearning(learning.id, {
        confidenceBase: newBase,
        confidence: newBase,
      })
    }
  }

  await db.update(conductorProposals).set({ status: 'approved' }).where(eq(conductorProposals.id, proposalId))
}

export async function rejectProposal(proposalId: string, userId: string): Promise<void> {
  await db
    .update(conductorProposals)
    .set({ status: 'rejected' })
    .where(and(eq(conductorProposals.id, proposalId), eq(conductorProposals.userId, userId)))
}
