// Token estimation with graceful fallback
// tiktoken requires WASM which can fail in some bundler configs

let tiktoken: typeof import('tiktoken') | null = null
let encoders: Record<string, any> = {}

// Lazy load tiktoken to handle WASM issues gracefully
async function loadTiktoken() {
    if (tiktoken === null) {
        try {
            tiktoken = await import('tiktoken')
        } catch (e) {
            console.warn('[Tokens] tiktoken unavailable, using approximation')
            tiktoken = undefined as any
        }
    }
    return tiktoken
}

export function estimateTokens(text: string, model: string = 'gpt-3.5-turbo'): number {
    // Synchronous fallback using character approximation
    // ~4 chars per token for English, ~2 for code
    const hasCode = /[{}\[\]();=<>]/.test(text)
    const charsPerToken = hasCode ? 3 : 4
    return Math.ceil(text.length / charsPerToken)
}

export async function estimateTokensAsync(text: string, model: string = 'gpt-3.5-turbo'): Promise<number> {
    const tk = await loadTiktoken()

    if (!tk) {
        return estimateTokens(text, model)
    }

    try {
        const encodingName = 'cl100k_base'

        if (!encoders[encodingName]) {
            try {
                encoders[encodingName] = tk.encoding_for_model(model as any)
            } catch (e) {
                encoders[encodingName] = tk.get_encoding(encodingName)
            }
        }

        const tokens = encoders[encodingName].encode(text)
        return tokens.length
    } catch (error) {
        console.warn('[Tokens] Encoding failed, using approximation', error)
        return estimateTokens(text, model)
    }
}

export function freeEncoders() {
    Object.values(encoders).forEach(e => {
        try { e.free?.() } catch {}
    })
    encoders = {}
}
