// src/lib/core/conductor/signals.ts
// Signal ingestion and routing — the v2.0 canonical signal policy.
//
// POLICY:
//   explicit -> applied immediately to confidence_base + stored in feedback
//   heuristic -> stored only; no confidence_base change
//   inaction -> stored only; no confidence_base change
//   end_of_session_judge -> creates a proposal; never auto-applies

import type { NebulaInterface } from '@/lib/nebula'
import type { ConductorSignal, ProposalType } from '../interface'
import { applyExplicitSignal } from './confidence'
import { createProposal } from './proposals'
import { assertNoDelete } from './guardrails'

export class SignalProcessor {
  constructor(private nebula: NebulaInterface) {}

  async process(signal: ConductorSignal): Promise<void> {
    assertNoDelete('update')

    const learning = await this.nebula.getLearning(signal.learningId)
    if (!learning) return

    await this.nebula.recordFeedback({
      userId: learning.userId,
      learningId: signal.learningId,
      conversationId: signal.conversationId,
      injectionId: signal.injectionId,
      signal: signal.signal,
      source: this.toFeedbackSource(signal.type),
    })

    switch (signal.type) {
      case 'explicit':
        await this.processExplicit(signal, learning)
        return
      case 'heuristic':
      case 'inaction':
        return
      case 'end_of_session_judge':
        await this.processJudgeSignal(signal, learning.userId)
        return
    }
  }

  private toFeedbackSource(type: ConductorSignal['type']): 'explicit' | 'heuristic' | 'inaction' | 'llm_judge' {
    if (type === 'explicit') return 'explicit'
    if (type === 'heuristic') return 'heuristic'
    if (type === 'inaction') return 'inaction'
    return 'llm_judge'
  }

  private async processExplicit(
    signal: ConductorSignal,
    learning: NonNullable<Awaited<ReturnType<NebulaInterface['getLearning']>>>,
  ): Promise<void> {
    if (signal.signal === 'none') return

    const result = applyExplicitSignal(learning, signal.signal)
    if (!result) return

    if (result.mustPropose) {
      await this.createSignalProposal(
        learning.userId,
        signal,
        result.newBase - learning.confidenceBase,
        'explicit signal exceeds large-delta threshold',
      )
      return
    }

    await this.nebula.updateLearning(learning.id, {
      confidenceBase: result.newBase,
      confidence: result.newBase,
    })
  }

  private async processJudgeSignal(signal: ConductorSignal, userId: string): Promise<void> {
    const delta = signal.signal === 'positive' ? 0.05 : signal.signal === 'negative' ? -0.07 : 0
    if (delta === 0) return
    await this.createSignalProposal(userId, signal, delta, 'end-of-session LLM judge verdict')
  }

  private async createSignalProposal(
    userId: string,
    signal: ConductorSignal,
    delta: number,
    rationale: string,
  ): Promise<void> {
    const type: ProposalType = delta >= 0 ? 'promote' : 'demote'
    await createProposal(userId, signal.learningId, type, delta, rationale)
  }
}
