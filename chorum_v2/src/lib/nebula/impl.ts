// src/lib/nebula/impl.ts
// NebulaInterface implementation — wires all Nebula modules.
// Layer 1 calls createNebula() once (singleton) and interacts only through NebulaInterface.

import type { NebulaInterface, CreateLearningInput, FeedbackInput, CreateApiTokenInput } from './interface'
import type {
  Learning, ScoredLearning, LearningLink, LinkType, CooccurrenceEntry,
  Feedback, InjectionAuditEntry, ApiToken, ScopeFilter
} from './types'

import { createLearning, getLearning, updateLearning, deleteLearning, getLearningsByScope, incrementUsageCount } from './queries'
import { searchByEmbedding, setEmbedding, hasEmbedding, getLearningsWithoutEmbedding } from './embeddings'
import { createLink, getLinksFor } from './links'
import { recordCooccurrence, getCohort } from './cooccurrence'
import { recordFeedback, getPendingFeedback, markFeedbackProcessed } from './feedback'
import { logInjectionAudit } from './audit'
import { validateApiToken, createApiToken, revokeApiToken } from './tokens'

class NebulaImpl implements NebulaInterface {
  async createLearning(input: CreateLearningInput): Promise<Learning> {
    return createLearning(input)
  }

  async getLearning(id: string): Promise<Learning | null> {
    return getLearning(id)
  }

  async updateLearning(id: string, patch: Parameters<NebulaInterface['updateLearning']>[1]): Promise<Learning> {
    return updateLearning(id, patch)
  }

  async deleteLearning(id: string): Promise<void> {
    return deleteLearning(id)
  }

  async incrementUsageCount(ids: string[]): Promise<void> {
    return incrementUsageCount(ids)
  }

  async getLearningsByScope(scopes: string[], userId: string): Promise<Learning[]> {
    return getLearningsByScope(scopes, userId)
  }

  async searchByEmbedding(
    userId: string,
    embedding: number[],
    dims: 384 | 1536,
    scopeFilter: ScopeFilter,
    limit: number,
    allowCrossLens?: boolean,
  ): Promise<ScoredLearning[]> {
    return searchByEmbedding(userId, embedding, dims, scopeFilter, limit, allowCrossLens ?? false)
  }

  async setEmbedding(learningId: string, embedding: number[], dims: 384 | 1536, model: string): Promise<void> {
    return setEmbedding(learningId, embedding, dims, model)
  }

  async hasEmbedding(learningId: string, dims: 384 | 1536): Promise<boolean> {
    return hasEmbedding(learningId, dims)
  }

  async getLearningsWithoutEmbedding(dims: 384 | 1536, limit: number): Promise<Learning[]> {
    return getLearningsWithoutEmbedding(dims, limit)
  }

  async createLink(sourceId: string, targetId: string, type: LinkType, strength: number): Promise<void> {
    return createLink(sourceId, targetId, type, strength)
  }

  async getLinksFor(learningId: string): Promise<LearningLink[]> {
    return getLinksFor(learningId)
  }

  async recordCooccurrence(ids: string[]): Promise<void> {
    return recordCooccurrence(ids)
  }

  async getCohort(learningId: string, limit: number): Promise<CooccurrenceEntry[]> {
    return getCohort(learningId, limit)
  }

  async recordFeedback(input: FeedbackInput): Promise<void> {
    return recordFeedback(input)
  }

  async getPendingFeedback(userId: string): Promise<Feedback[]> {
    return getPendingFeedback(userId)
  }

  async markFeedbackProcessed(ids: string[]): Promise<void> {
    return markFeedbackProcessed(ids)
  }

  async logInjectionAudit(entries: Omit<InjectionAuditEntry, 'id' | 'createdAt'>[]): Promise<void> {
    return logInjectionAudit(entries)
  }

  async validateApiToken(hashedToken: string): Promise<ApiToken | null> {
    return validateApiToken(hashedToken)
  }

  async createApiToken(input: CreateApiTokenInput): Promise<{ token: string; record: ApiToken }> {
    return createApiToken(input)
  }

  async revokeApiToken(id: string): Promise<void> {
    return revokeApiToken(id)
  }
}

// Singleton — create once per process
let _nebula: NebulaInterface | null = null

export function createNebula(): NebulaInterface {
  if (!_nebula) {
    _nebula = new NebulaImpl()
  }
  return _nebula
}