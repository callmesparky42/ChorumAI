/**
 * Learning Context Cache Manager
 * Handles retrieval, compilation, and invalidation of tiered context caches.
 */
import { db } from '@/lib/db'
import { learningContextCache, providerCredentials, usageLog, projectLearningPaths } from '@/lib/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { compileTier1, compileTier2, promoteHighUsageItems, type CompilerProviderConfig } from './compiler'
import { decrypt } from '@/lib/crypto'
import type { LearningItem, LearningItemMetadata } from './types'

export async function getCachedContext(
    projectId: string,
    tier: 1 | 2
): Promise<string | null> {
    const cache = await db.query.learningContextCache.findFirst({
        where: and(
            eq(learningContextCache.projectId, projectId),
            eq(learningContextCache.tier, tier)
        )
    })

    if (!cache) return null

    // Check validity
    // 1. Not explicitly invalidated
    if (cache.invalidatedAt) return null

    // 2. Check if stale relative to learnings?
    // The spec says: "compiled_at is more recent than the most recent learning's created_at"
    // However, we rely on invalidation hooks to set invalidatedAt.
    // If we strictly check timestamps here, we might need a DB join or extra query.
    // Spec: "Invalidate cache... This is a lightweight operation... recompile happens lazily".
    // So if invalidatedAt is set, it's stale.
    // If we missed an invalidation hook, we might serve stale data.
    // Trust the invalidation mechanism for now as per spec "invalidated_at IS NULL".

    return cache.compiledContext
}

export async function invalidateCache(projectId: string): Promise<void> {
    // NOTE: If the scoring model changes (decay curves, weight profiles),
    // existing compiled caches may be stale. Call invalidateCache() for
    // affected projects, or perform a bulk invalidation:
    //   UPDATE learning_context_cache SET invalidated_at = now();

    await db.update(learningContextCache)
        .set({ invalidatedAt: new Date() })
        .where(eq(learningContextCache.projectId, projectId))
}

export async function recompileCache(
    projectId: string,
    userId: string
): Promise<void> {
    console.log(`[Cache] Recompiling for project ${projectId}`)

    // 0. Promote high-usage items before compilation
    await promoteHighUsageItems(projectId)

    // 1. Fetch all learnings (Directly to avoid circular dependency with manager.ts)
    const rawItems = await db.select()
        .from(projectLearningPaths)
        .where(eq(projectLearningPaths.projectId, projectId))
        .limit(1000)

    const learnings = rawItems.map(item => ({
        ...item,
        metadata: item.metadata as LearningItemMetadata | null
    })) as LearningItem[]

    if (learnings.length === 0) {
        await db.delete(learningContextCache)
            .where(eq(learningContextCache.projectId, projectId))
        return
    }

    // 2. Select cheapest provider for compilation
    const provider = await getCheapestProvider(userId)

    // 3. Compile Tiers
    // Tier 1
    const tier1 = await compileTier1(projectId, learnings, provider)

    // Tier 2
    const tier2 = await compileTier2(projectId, learnings, provider)

    // 4. Store (Upsert)
    // We use ON CONFLICT DO UPDATE
    await db.insert(learningContextCache)
        .values([{
            projectId,
            tier: 1,
            compiledContext: tier1.compiledContext,
            tokenEstimate: tier1.tokenEstimate,
            learningCount: tier1.learningCount,
            invariantCount: tier1.invariantCount,
            compiledAt: new Date(),
            invalidatedAt: null,
            compilerModel: provider ? `${provider.provider}:${provider.model}` : 'rule-based'
        }, {
            projectId,
            tier: 2,
            compiledContext: tier2.compiledContext,
            tokenEstimate: tier2.tokenEstimate,
            learningCount: tier2.learningCount,
            invariantCount: tier2.invariantCount,
            compiledAt: new Date(),
            invalidatedAt: null,
            compilerModel: provider ? `${provider.provider}:${provider.model}` : 'rule-based'
        }])
        .onConflictDoUpdate({
            target: [learningContextCache.projectId, learningContextCache.tier],
            set: {
                compiledContext: sql`excluded.compiled_context`,
                tokenEstimate: sql`excluded.token_estimate`,
                learningCount: sql`excluded.learning_count`,
                invariantCount: sql`excluded.invariant_count`,
                compiledAt: new Date(),
                invalidatedAt: null,
                compilerModel: sql`excluded.compiler_model`
            }
        })

    console.log(`[Cache] Recompiled Tier 1 (${tier1.tokenEstimate} toks) & Tier 2 (${tier2.tokenEstimate} toks)`)
}

/**
 * Get optimal provider for background tasks (compilation, summarization)
 * Uses explicit cascade rather than cost-based sorting for predictability.
 * Preference order: Gemini (cheapest) → Anthropic → OpenAI → DeepSeek
 * Each provider uses a hardcoded "cheap" model suitable for background tasks.
 */
async function getCheapestProvider(userId: string): Promise<CompilerProviderConfig | undefined> {
    const creds = await db.query.providerCredentials.findMany({
        where: and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.isActive, true)
        )
    })

    // Filter out local providers (Ollama, LM Studio) - they're not available on Vercel
    const cloudCreds = creds.filter(c => !c.isLocal)

    // Helper to find a provider and return with preferred cheap model
    const findProvider = (providerName: string, cheapModel: string): CompilerProviderConfig | undefined => {
        const cred = cloudCreds.find(c => c.provider === providerName)
        if (!cred) return undefined
        return {
            provider: cred.provider,
            model: cheapModel,
            apiKey: decrypt(cred.apiKeyEncrypted),
            baseUrl: cred.baseUrl || undefined,
            isLocal: false
        }
    }

    // Cascade: Check providers in order of cost-effectiveness for background tasks
    // 1. Google Gemini - Flash is extremely cheap ($0.075/1M input)
    const google = findProvider('google', 'gemini-2.0-flash')
    if (google) return google

    // 2. Anthropic - Haiku is the cheap workhorse ($0.25/1M input)
    const anthropic = findProvider('anthropic', 'claude-3-haiku-20240307')
    if (anthropic) return anthropic

    // 3. OpenAI - 4o-mini is the new cheap option ($0.15/1M input)
    const openai = findProvider('openai', 'gpt-4o-mini')
    if (openai) return openai

    // 4. DeepSeek - Very cheap but may have latency ($0.14/1M input)
    const deepseek = findProvider('deepseek', 'deepseek-chat')
    if (deepseek) return deepseek

    // 5. Fallback to env vars if no user credentials
    if (process.env.GOOGLE_API_KEY) return {
        provider: 'google', model: 'gemini-2.0-flash', apiKey: process.env.GOOGLE_API_KEY
    }
    if (process.env.ANTHROPIC_API_KEY) return {
        provider: 'anthropic', model: 'claude-3-haiku-20240307', apiKey: process.env.ANTHROPIC_API_KEY
    }
    if (process.env.OPENAI_API_KEY) return {
        provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY
    }

    return undefined
}
