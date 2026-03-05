// src/lib/core/impl.ts
// BinaryStar: wires Podium + Conductor into BinaryStarInterface.
// Layer 2 imports createBinaryStar() only.

import type { NebulaInterface } from '@/lib/nebula'
import type {
    BinaryStarInterface, PodiumRequest, PodiumResult,
    ConductorSignal, ConductorProposal, ProposalType
} from './interface'
import { createPodium } from './podium'
import { createConductor } from './conductor'

class BinaryStarImpl implements BinaryStarInterface {
    private podium
    private conductor

    constructor(nebula: NebulaInterface) {
        this.podium = createPodium(nebula)
        this.conductor = createConductor(nebula)
    }

    async getContext(request: PodiumRequest): Promise<PodiumResult> {
        return this.podium.getContext(request)
    }

    async submitSignal(signal: ConductorSignal): Promise<void> {
        return this.conductor.submitSignal(signal)
    }

    async getProposals(userId: string): Promise<ConductorProposal[]> {
        return this.conductor.getProposals(userId)
    }

    async createProposal(
        userId: string,
        learningId: string,
        type: ProposalType,
        delta: number,
        rationale: string,
    ): Promise<ConductorProposal> {
        return this.conductor.createProposal(userId, learningId, type, delta, rationale)
    }

    async maybeFireSessionJudge(userId: string, conversationId: string, injectedIds: string[]): Promise<void> {
        return this.conductor.maybeFireSessionJudge(userId, conversationId, injectedIds)
    }

    async approveProposal(proposalId: string, userId: string): Promise<void> {
        return this.conductor.approveProposal(proposalId, userId)
    }

    async rejectProposal(proposalId: string, userId: string): Promise<void> {
        return this.conductor.rejectProposal(proposalId, userId)
    }
}

let _binaryStar: BinaryStarInterface | null = null

export function createBinaryStar(nebula: NebulaInterface): BinaryStarInterface {
    if (!_binaryStar) {
        _binaryStar = new BinaryStarImpl(nebula)
    }
    return _binaryStar
}
