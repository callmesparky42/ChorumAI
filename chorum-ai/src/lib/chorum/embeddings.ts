/**
 * EmbeddingsService
 * Multi-provider embedding service for generating 384-dimensional vectors.
 *
 * Provider priority: OpenAI > Google > Mistral > Ollama > zero vector
 *
 * When a userId is provided, resolves the best embedding-capable provider
 * from the user's configured credentials. Falls back to OPENAI_API_KEY env
 * var when no userId is given (backward compatible).
 *
 * All providers output 384-dimension vectors to match the schema's vector(384).
 * OpenAI and Google support native dimension reduction. Mistral and Ollama
 * embeddings are truncated + renormalized (safe due to Matryoshka representations).
 */

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '@/lib/db'
import { providerCredentials } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { decrypt } from '@/lib/crypto'

const EMBEDDING_DIMENSIONS = 384

// Embedding-capable providers in priority order
const EMBEDDING_PRIORITY: string[] = ['openai', 'google', 'mistral', 'ollama']

// Embedding models per provider
const EMBEDDING_MODELS: Record<string, string> = {
    openai: 'text-embedding-3-small',
    google: 'text-embedding-004',
    mistral: 'mistral-embed',
    ollama: 'nomic-embed-text'
}

interface EmbeddingProviderConfig {
    provider: string
    apiKey: string
    model: string
    baseUrl?: string
}

interface CachedResolution {
    config: EmbeddingProviderConfig | null
    resolvedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

class EmbeddingsService {
    private static instance: EmbeddingsService
    private openai: OpenAI | null = null
    private envKeyAvailable = false
    private initAttempted = false

    // Per-user provider resolution cache
    private userProviderCache = new Map<string, CachedResolution>()
    // Deduplicate zero-vector warnings per user
    private warnedUsers = new Set<string>()

    private constructor() { }

    public static getInstance(): EmbeddingsService {
        if (!EmbeddingsService.instance) {
            EmbeddingsService.instance = new EmbeddingsService()
        }
        return EmbeddingsService.instance
    }

    /**
     * Initialize OpenAI client from env var (backward compat fallback)
     */
    private initEnvFallback() {
        if (this.initAttempted) return
        this.initAttempted = true

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) return

        try {
            this.openai = new OpenAI({ apiKey })
            this.envKeyAvailable = true
            console.log('[Embeddings] OpenAI env fallback initialized')
        } catch (error) {
            console.error('[Embeddings] Failed to initialize OpenAI from env:', error)
        }
    }

    /**
     * Check if embeddings are available (env var path)
     */
    public isAvailable(): boolean {
        if (!this.initAttempted) this.initEnvFallback()
        return this.envKeyAvailable
    }

    // ========================================================================
    // Provider Resolution
    // ========================================================================

    /**
     * Resolve the best embedding-capable provider for a user.
     * Caches results for 5 minutes per user.
     */
    private async resolveEmbeddingProvider(userId: string): Promise<EmbeddingProviderConfig | null> {
        // Check cache
        const cached = this.userProviderCache.get(userId)
        if (cached && (Date.now() - cached.resolvedAt) < CACHE_TTL_MS) {
            return cached.config
        }

        try {
            const creds = await db.query.providerCredentials.findMany({
                where: and(
                    eq(providerCredentials.userId, userId),
                    eq(providerCredentials.isActive, true)
                )
            })

            // Find highest-priority embedding-capable provider
            for (const providerName of EMBEDDING_PRIORITY) {
                const cred = creds.find(c => c.provider === providerName)
                if (cred) {
                    const config: EmbeddingProviderConfig = {
                        provider: providerName,
                        apiKey: decrypt(cred.apiKeyEncrypted),
                        model: EMBEDDING_MODELS[providerName],
                        baseUrl: cred.baseUrl || undefined
                    }
                    this.userProviderCache.set(userId, { config, resolvedAt: Date.now() })
                    return config
                }
            }

            // Check for openai-compatible providers that might support embeddings
            const compatCred = creds.find(c =>
                c.provider === 'openai-compatible' || c.provider === 'lmstudio'
            )
            if (compatCred && compatCred.baseUrl) {
                const config: EmbeddingProviderConfig = {
                    provider: 'openai-compatible',
                    apiKey: decrypt(compatCred.apiKeyEncrypted),
                    model: 'default',
                    baseUrl: compatCred.baseUrl
                }
                this.userProviderCache.set(userId, { config, resolvedAt: Date.now() })
                return config
            }
        } catch (error) {
            console.error('[Embeddings] Failed to resolve provider for user:', error)
        }

        // No embedding provider found
        this.userProviderCache.set(userId, { config: null, resolvedAt: Date.now() })
        return null
    }

    // ========================================================================
    // Provider-Specific Embedding Functions
    // ========================================================================

    private async embedViaOpenAI(text: string, apiKey: string): Promise<number[]> {
        const client = new OpenAI({ apiKey })
        const response = await client.embeddings.create({
            model: EMBEDDING_MODELS.openai,
            input: text,
            dimensions: EMBEDDING_DIMENSIONS
        })
        return this.normalize(response.data[0].embedding)
    }

    private async embedViaGoogle(text: string, apiKey: string): Promise<number[]> {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODELS.google })
        const result = await model.embedContent({
            content: { parts: [{ text }], role: 'user' },
            outputDimensionality: EMBEDDING_DIMENSIONS
        } as any) // outputDimensionality supported but types may lag
        return this.normalize(result.embedding.values)
    }

    private async embedViaMistral(text: string, apiKey: string, baseUrl?: string): Promise<number[]> {
        const url = baseUrl || 'https://api.mistral.ai/v1'
        const response = await fetch(`${url}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: EMBEDDING_MODELS.mistral,
                input: [text]
            })
        })

        if (!response.ok) {
            throw new Error(`Mistral embedding error: ${response.status}`)
        }

        const result = await response.json()
        const raw: number[] = result.data[0].embedding
        return this.truncateAndNormalize(raw, EMBEDDING_DIMENSIONS)
    }

    private async embedViaOllama(text: string, baseUrl?: string): Promise<number[]> {
        const url = (baseUrl || 'http://localhost:11434').replace(/\/$/, '').replace(/\/v1$/, '')
        const response = await fetch(`${url}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: EMBEDDING_MODELS.ollama,
                input: text
            })
        })

        if (!response.ok) {
            throw new Error(`Ollama embedding error: ${response.status}`)
        }

        const result = await response.json()
        // Ollama /api/embed returns { embeddings: [[...]] }
        const raw: number[] = result.embeddings?.[0] || []
        if (raw.length === 0) throw new Error('Ollama returned empty embedding')
        return this.truncateAndNormalize(raw, EMBEDDING_DIMENSIONS)
    }

    private async embedViaOpenAICompatible(text: string, apiKey: string, baseUrl: string): Promise<number[]> {
        const url = baseUrl.replace(/\/$/, '')
        const response = await fetch(`${url}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                model: 'default',
                input: [text]
            })
        })

        if (!response.ok) {
            throw new Error(`OpenAI-compatible embedding error: ${response.status}`)
        }

        const result = await response.json()
        const raw: number[] = result.data?.[0]?.embedding || []
        if (raw.length === 0) throw new Error('OpenAI-compatible returned empty embedding')
        return this.truncateAndNormalize(raw, EMBEDDING_DIMENSIONS)
    }

    // ========================================================================
    // Core Embedding Dispatch
    // ========================================================================

    private async embedWithProvider(text: string, config: EmbeddingProviderConfig): Promise<number[]> {
        switch (config.provider) {
            case 'openai':
                return this.embedViaOpenAI(text, config.apiKey)
            case 'google':
                return this.embedViaGoogle(text, config.apiKey)
            case 'mistral':
                return this.embedViaMistral(text, config.apiKey, config.baseUrl)
            case 'ollama':
                return this.embedViaOllama(text, config.baseUrl)
            case 'openai-compatible':
            case 'lmstudio':
                return this.embedViaOpenAICompatible(text, config.apiKey, config.baseUrl!)
            default:
                throw new Error(`Unknown embedding provider: ${config.provider}`)
        }
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Generate a 384-dimensional embedding vector.
     *
     * @param text - Text to embed
     * @param userId - Optional user ID for provider resolution. If omitted, uses OPENAI_API_KEY env var.
     */
    public async embed(text: string, userId?: string): Promise<number[]> {
        // Normalize text
        const cleanText = text.trim().replace(/\s+/g, ' ')
        if (!cleanText) {
            return this.zeroVector()
        }

        // Path 1: User-aware provider resolution
        if (userId) {
            const config = await this.resolveEmbeddingProvider(userId)
            if (config) {
                try {
                    return await this.embedWithProvider(cleanText, config)
                } catch (error) {
                    console.error(`[Embeddings] ${config.provider} failed, trying fallback:`, error)
                    // Try env var OpenAI as last resort
                    return this.embedWithEnvFallback(cleanText, userId)
                }
            }
            // No user provider — try env var fallback
            return this.embedWithEnvFallback(cleanText, userId)
        }

        // Path 2: No userId — env var only (backward compatible)
        if (!this.initAttempted) this.initEnvFallback()

        if (!this.openai) {
            return this.zeroVector()
        }

        try {
            const response = await this.openai.embeddings.create({
                model: EMBEDDING_MODELS.openai,
                input: cleanText,
                dimensions: EMBEDDING_DIMENSIONS
            })
            return this.normalize(response.data[0].embedding)
        } catch (error) {
            console.error('[Embeddings] OpenAI embedding failed:', error)
            return this.zeroVector()
        }
    }

    /**
     * Batch embed multiple texts.
     */
    public async embedBatch(texts: string[], userId?: string): Promise<number[][]> {
        if (texts.length === 0) return []

        // For now, batch = sequential single embeds.
        // OpenAI supports true batching but other providers don't uniformly.
        const results: number[][] = []
        for (const text of texts) {
            results.push(await this.embed(text, userId))
        }
        return results
    }

    /**
     * Warm up (ensures env fallback client is initialized)
     */
    public async warmup() {
        this.initEnvFallback()
        if (this.envKeyAvailable) {
            console.log('[Embeddings] Ready (OpenAI env fallback available)')
        } else {
            console.log('[Embeddings] No OPENAI_API_KEY env var — will resolve per-user providers')
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private async embedWithEnvFallback(text: string, userId: string): Promise<number[]> {
        if (!this.initAttempted) this.initEnvFallback()

        if (this.openai) {
            try {
                const response = await this.openai.embeddings.create({
                    model: EMBEDDING_MODELS.openai,
                    input: text,
                    dimensions: EMBEDDING_DIMENSIONS
                })
                return this.normalize(response.data[0].embedding)
            } catch (error) {
                console.error('[Embeddings] Env fallback OpenAI also failed:', error)
            }
        }

        // Absolute last resort
        if (!this.warnedUsers.has(userId)) {
            console.warn(
                `[Embeddings] WARNING: No embedding provider available for user ${userId}. ` +
                `Semantic similarity is disabled. Configure OpenAI, Google, Mistral, or Ollama to enable.`
            )
            this.warnedUsers.add(userId)
        }
        return this.zeroVector()
    }

    private normalize(embedding: number[]): number[] {
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
        if (magnitude > 0) {
            return embedding.map(val => val / magnitude)
        }
        return embedding
    }

    /**
     * Truncate to target dimensions and renormalize.
     * Safe for models using Matryoshka representation learning.
     */
    private truncateAndNormalize(embedding: number[], targetDims: number): number[] {
        const truncated = embedding.length > targetDims
            ? embedding.slice(0, targetDims)
            : embedding
        return this.normalize(truncated)
    }

    private zeroVector(): number[] {
        return new Array(EMBEDDING_DIMENSIONS).fill(0)
    }
}

export const embeddings = EmbeddingsService.getInstance()
