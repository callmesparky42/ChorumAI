/**
 * EmbeddingsService
 * Singleton service for generating vector embeddings.
 *
 * Primary: OpenAI text-embedding-3-small (384 dimensions to match schema)
 * Fallback: Zero vector (graceful degradation)
 */

import OpenAI from 'openai'

const EMBEDDING_DIMENSIONS = 384
const EMBEDDING_MODEL = 'text-embedding-3-small'

class EmbeddingsService {
    private static instance: EmbeddingsService
    private openai: OpenAI | null = null
    private isDisabled = false
    private initAttempted = false

    private constructor() { }

    public static getInstance(): EmbeddingsService {
        if (!EmbeddingsService.instance) {
            EmbeddingsService.instance = new EmbeddingsService()
        }
        return EmbeddingsService.instance
    }

    /**
     * Initialize OpenAI client
     */
    private init() {
        if (this.initAttempted) return
        this.initAttempted = true

        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            console.warn('[Embeddings] OPENAI_API_KEY not set - embeddings disabled')
            this.isDisabled = true
            return
        }

        try {
            this.openai = new OpenAI({ apiKey })
            console.log('[Embeddings] OpenAI client initialized')
        } catch (error) {
            console.error('[Embeddings] Failed to initialize OpenAI:', error)
            this.isDisabled = true
        }
    }

    /**
     * Check if embeddings are available
     */
    public isAvailable(): boolean {
        if (!this.initAttempted) this.init()
        return !this.isDisabled && this.openai !== null
    }

    /**
     * Generates a 384-dimensional embedding vector for the given text.
     * Returns zero vector if embeddings are unavailable.
     */
    public async embed(text: string): Promise<number[]> {
        if (!this.initAttempted) this.init()

        // Return zero vector if disabled
        if (this.isDisabled || !this.openai) {
            return new Array(EMBEDDING_DIMENSIONS).fill(0)
        }

        // Normalize text
        const cleanText = text.trim().replace(/\s+/g, ' ')
        if (!cleanText) {
            return new Array(EMBEDDING_DIMENSIONS).fill(0)
        }

        try {
            const response = await this.openai.embeddings.create({
                model: EMBEDDING_MODEL,
                input: cleanText,
                dimensions: EMBEDDING_DIMENSIONS
            })

            const embedding = response.data[0].embedding

            // Normalize to unit vector for cosine similarity
            const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
            if (magnitude > 0) {
                return embedding.map(val => val / magnitude)
            }
            return embedding
        } catch (error) {
            console.error('[Embeddings] OpenAI embedding failed:', error)
            return new Array(EMBEDDING_DIMENSIONS).fill(0)
        }
    }

    /**
     * Batch embed multiple texts (more efficient for bulk operations)
     */
    public async embedBatch(texts: string[]): Promise<number[][]> {
        if (!this.initAttempted) this.init()

        if (this.isDisabled || !this.openai || texts.length === 0) {
            return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0))
        }

        // Clean texts
        const cleanTexts = texts.map(t => t.trim().replace(/\s+/g, ' ')).filter(t => t)
        if (cleanTexts.length === 0) {
            return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0))
        }

        try {
            const response = await this.openai.embeddings.create({
                model: EMBEDDING_MODEL,
                input: cleanTexts,
                dimensions: EMBEDDING_DIMENSIONS
            })

            // Normalize each embedding
            return response.data.map(item => {
                const embedding = item.embedding
                const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
                if (magnitude > 0) {
                    return embedding.map(val => val / magnitude)
                }
                return embedding
            })
        } catch (error) {
            console.error('[Embeddings] OpenAI batch embedding failed:', error)
            return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0))
        }
    }

    /**
     * Warm up (just ensures client is initialized)
     */
    public async warmup() {
        this.init()
        if (this.isAvailable()) {
            console.log('[Embeddings] Ready (OpenAI text-embedding-3-small)')
        }
    }
}

export const embeddings = EmbeddingsService.getInstance()
