// src/lib/core/conductor/conductor.ts

import type { NebulaInterface } from '@/lib/nebula'
import type { ConductorSignal, ConductorProposal, ProposalType } from '../interface'
import { SignalProcessor } from './signals'
import {
  getProposals,
  approveProposal,
  rejectProposal,
  createProposal as createProposalRecord,
} from './proposals'
import { maybeFireSessionJudge as maybeFireSessionJudgeImpl } from './judge'

export class ConductorImpl {
  private signalProcessor: SignalProcessor

  constructor(private nebula: NebulaInterface) {
    this.signalProcessor = new SignalProcessor(nebula)
  }

  async submitSignal(signal: ConductorSignal): Promise<void> {
    try {
      await this.signalProcessor.process(signal)
    } catch (err) {
      console.error('[Conductor] Signal processing error:', err)
    }
  }

  async getProposals(userId: string): Promise<ConductorProposal[]> {
    return getProposals(userId)
  }

  async createProposal(
    userId: string,
    learningId: string,
    type: ProposalType,
    delta: number,
    rationale: string,
  ): Promise<ConductorProposal> {
    return createProposalRecord(userId, learningId, type, delta, rationale)
  }

  async maybeFireSessionJudge(userId: string, conversationId: string, injectedIds: string[]): Promise<void> {
    return maybeFireSessionJudgeImpl(userId, conversationId, injectedIds, this.nebula)
  }

  async approveProposal(proposalId: string, userId: string): Promise<void> {
    return approveProposal(proposalId, userId, this.nebula)
  }

  async rejectProposal(proposalId: string, userId: string): Promise<void> {
    return rejectProposal(proposalId, userId)
  }
}

export function createConductor(nebula: NebulaInterface): ConductorImpl {
  return new ConductorImpl(nebula)
}
