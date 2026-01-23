import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

/** Retry configuration for model loading */
const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
}

/**
 * EmbeddingsService
 * Singleton service to handle local vector embedding generation using Transformers.js.
 * Uses 'all-MiniLM-L6-v2' (quantized) which runs efficiently on CPU.
 */
class EmbeddingsService {
    private static instance: EmbeddingsService
    private pipe: FeatureExtractionPipeline | null = null
    private modelName = 'Xenova/all-MiniLM-L6-v2'
    private isLoading = false
    private loadError: Error | null = null

    private constructor() { }

    public static getInstance(): EmbeddingsService {
        if (!EmbeddingsService.instance) {
            EmbeddingsService.instance = new EmbeddingsService()
        }
        return EmbeddingsService.instance
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * Calculate exponential backoff delay with jitter
     */
    private getRetryDelay(attempt: number): number {
        const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
        const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
        return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs)
    }

    /**
     * Initializes the model pipeline with retry logic.
     * Uses exponential backoff on failure.
     */
    private async init() {
        if (this.pipe) return
        if (this.isLoading) {
            // Wait for existing load
            while (this.isLoading) {
                await this.sleep(100)
            }
            if (this.pipe) return
            // If loading failed, throw the error
            if (this.loadError) throw this.loadError
        }

        this.isLoading = true
        this.loadError = null

        for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`[Embeddings] Retry attempt ${attempt + 1}/${RETRY_CONFIG.maxAttempts}...`)
                } else {
                    console.log(`[Embeddings] Loading model ${this.modelName}...`)
                }

                this.pipe = await pipeline('feature-extraction', this.modelName, {
                    quantized: true, // drastically reduces size/memory
                })
                console.log('[Embeddings] Model loaded successfully')
                this.isLoading = false
                return
            } catch (error) {
                const isLastAttempt = attempt === RETRY_CONFIG.maxAttempts - 1
                console.error(`[Embeddings] Failed to load model (attempt ${attempt + 1}):`, error)

                if (isLastAttempt) {
                    this.loadError = error instanceof Error ? error : new Error(String(error))
                    this.isLoading = false
                    throw this.loadError
                }

                const delay = this.getRetryDelay(attempt)
                console.log(`[Embeddings] Retrying in ${Math.round(delay)}ms...`)
                await this.sleep(delay)
            }
        }
    }

    /**
     * Generates a 384-dimensional embedding vector for the given text.
     */
    public async embed(text: string): Promise<number[]> {
        await this.init()
        if (!this.pipe) throw new Error('Embeddings model unavailable')

        // Normalize text (trim, lower?) - standard is usually raw but trimmed
        const cleanText = text.trim().replace(/\s+/g, ' ')

        if (!cleanText) return new Array(384).fill(0)

        // Generate embedding
        // pooling: 'mean' averages token embeddings to get sentence embedding
        // normalize: true produces unit vectors (required for cosine similarity)
        const output = await this.pipe(cleanText, { pooling: 'mean', normalize: true })

        // Output.data is Float32Array, convert to number[]
        return Array.from(output.data)
    }

    /**
     * Warm up the model (optional calling on app start)
     */
    public async warmup() {
        await this.init()
    }
}

export const embeddings = EmbeddingsService.getInstance()
