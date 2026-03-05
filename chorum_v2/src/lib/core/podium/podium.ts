// src/lib/core/podium/podium.ts
import type { NebulaInterface } from '@/lib/nebula'
import type { PodiumRequest, PodiumResult, InjectedLearning } from '../interface'
import type { ScoredLearning } from '@/lib/nebula'
import { computeEffectiveBudget, estimateTokens } from './tiers'
import { scoreCandidate } from './scorer'
import { compileContext } from './compiler'
import { getCached, setCached } from './cache'
import type { Tier } from './tiers'

const DEFAULT_QUALITY_THRESHOLD = 0.35

export class PodiumImpl {
    constructor(private nebula: NebulaInterface) { }

    async getContext(req: PodiumRequest): Promise<PodiumResult> {
        const { tier, effectiveBudget } = computeEffectiveBudget(req.contextWindowSize)

        // --- Check cache (Tier 1 and 2 only) ---
        if (tier <= 2) {
            const cached = getCached(req.userId, req.scopeFilter.include, req.domainSignal.primary, tier)
            if (cached) {
                // Cache hit: re-audit as all-included with cached context
                return {
                    injectedItems: cached.items,
                    tierUsed: cached.tierUsed,
                    tokensUsed: cached.tokensUsed,
                    compiledContext: cached.compiledContext,
                    auditEntries: cached.items.map((item) => ({
                        learningId: item.id,
                        included: true,
                        score: item.relevanceScore,
                        reason: 'cache-hit',
                        excludeReason: null,
                    })),
                }
            }
        }

        // --- Fetch candidates via semantic search ---
        let candidates: ScoredLearning[] = []
        if (req.queryEmbedding && req.queryEmbedding.length > 0) {
            // Determine embedding dimensions from the vector length
            const dims = req.queryEmbedding.length >= 1000 ? 1536 : 384 as 384 | 1536
            candidates = await this.nebula.searchByEmbedding(
                req.userId,
                req.queryEmbedding,
                dims,
                req.scopeFilter,
                100,   // fetch top 100 candidates; selection reduces to budget
            )
        }

        // Fetch pinned items separately and prepend (always inject if budget allows)
        const allInScope = await this.nebula.getLearningsByScope(
            req.scopeFilter.include.length > 0 ? req.scopeFilter.include : [],
            req.userId,
        )
        const pinnedItems = allInScope.filter((l) => l.pinnedAt !== null)

        // --- Exclude muted items (contract invariant: never inject muted learnings) ---
        const auditEntries: PodiumResult['auditEntries'] = []
        const unmuted: ScoredLearning[] = []
        for (const c of candidates) {
            if (c.mutedAt !== null) {
                auditEntries.push({
                    learningId: c.id,
                    included: false,
                    score: 0,
                    reason: null,
                    excludeReason: 'muted',
                })
            } else {
                unmuted.push(c)
            }
        }
        candidates = unmuted

        // --- Get scope tags for each candidate for scoring ---
        // Phase 2: scope tags are inferred from scopeFilter context; full per-item lookup is Phase 3+
        // For now, treat items returned by searchByEmbedding as scope-matching (Nebula enforces this)
        const itemScopesCache = new Map<string, string[]>()
        const getScopesTags = (id: string) => itemScopesCache.get(id) ?? req.scopeFilter.include

        // --- Score candidates ---
        const scored = candidates.map((c) => {
            const { score, includeReason } = scoreCandidate(
                c,
                req.intent,
                req.domainSignal.primary,
                req.scopeFilter,
                getScopesTags(c.id),
            )
            const tokenCount = estimateTokens(c.content)
            return {
                learning: c,
                score,
                tokenCount,
                attentionDensity: tokenCount > 0 ? score / tokenCount : 0,
                includeReason,
            }
        })

        // Sort by attention density (score / tokenCount) — not raw score
        scored.sort((a, b) => b.attentionDensity - a.attentionDensity)

        // --- Selection pass ---
        let remainingBudget = effectiveBudget
        const excluded: typeof scored = []
        const selected: InjectedLearning[] = []

        // Pinned items first (always inject, consume budget)
        for (const pinned of pinnedItems) {
            const tokenCount = estimateTokens(pinned.content)
            if (tokenCount <= remainingBudget) {
                remainingBudget -= tokenCount
                selected.push({
                    id: pinned.id,
                    content: pinned.content,
                    type: pinned.type,
                    confidence: pinned.confidence,
                    relevanceScore: 1.0,    // pinned = always relevant
                    tokenCount,
                })
                auditEntries.push({
                    learningId: pinned.id,
                    included: true,
                    score: 1.0,
                    reason: 'pinned',
                    excludeReason: null,
                })
            } else {
                auditEntries.push({
                    learningId: pinned.id,
                    included: false,
                    score: 1.0,
                    reason: null,
                    excludeReason: `pinned tokenCount ${tokenCount} exceeds remaining budget ${remainingBudget}`,
                })
            }
        }

        // Fill remaining budget with scored candidates
        for (const candidate of scored) {
            // Skip if this is also a pinned item (already added above)
            if (candidate.learning.pinnedAt !== null) continue

            if (candidate.score < DEFAULT_QUALITY_THRESHOLD) {
                excluded.push(candidate)
                auditEntries.push({
                    learningId: candidate.learning.id,
                    included: false,
                    score: candidate.score,
                    reason: null,
                    excludeReason: `score ${candidate.score.toFixed(3)} below quality threshold ${DEFAULT_QUALITY_THRESHOLD}`,
                })
                continue
            }

            if (candidate.tokenCount > remainingBudget) {
                excluded.push(candidate)
                auditEntries.push({
                    learningId: candidate.learning.id,
                    included: false,
                    score: candidate.score,
                    reason: null,
                    excludeReason: `tokenCount ${candidate.tokenCount} exceeds remaining budget ${remainingBudget}`,
                })
                continue
            }

            remainingBudget -= candidate.tokenCount
            selected.push({
                id: candidate.learning.id,
                content: candidate.learning.content,
                type: candidate.learning.type,
                confidence: candidate.learning.confidence,
                relevanceScore: candidate.score,
                tokenCount: candidate.tokenCount,
            })
            auditEntries.push({
                learningId: candidate.learning.id,
                included: true,
                score: candidate.score,
                reason: candidate.includeReason,
                excludeReason: null,
            })
        }

        const tokensUsed = effectiveBudget - remainingBudget
        const compiledContext = compileContext(selected, tier, req.domainSignal.primary)

        // --- Write injection audit to Nebula (all decisions) ---
        await this.nebula.logInjectionAudit(
            auditEntries.map((e) => ({
                userId: req.userId,
                conversationId: req.conversationId,
                learningId: e.learningId,
                included: e.included,
                score: e.score,
                reason: e.reason,
                excludeReason: e.excludeReason,
                tierUsed: tier,
                tokensUsed: e.included ? (selected.find((s) => s.id === e.learningId)?.tokenCount ?? null) : null,
            }))
        )

        // --- Fire-and-forget: increment usageCount for injected items ---
        const injectedIds = selected.map((s) => s.id)
        if (injectedIds.length > 0) {
            this.nebula.incrementUsageCount(injectedIds).catch(() => { /* non-critical */ })
        }

        // --- Populate cache (Tier 1/2 only) ---
        if (tier <= 2 && selected.length > 0) {
            setCached(req.userId, req.scopeFilter.include, req.domainSignal.primary, tier, {
                items: selected, compiledContext, tierUsed: tier, tokensUsed, cachedAt: Date.now(),
            })
        }

        return { injectedItems: selected, tierUsed: tier, tokensUsed, compiledContext, auditEntries }
    }
}

export function createPodium(nebula: NebulaInterface): PodiumImpl {
    return new PodiumImpl(nebula)
}
