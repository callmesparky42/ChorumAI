import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * GET /api/local-models
 *
 * Discovers locally available models from Ollama and LM Studio.
 * Used by the Settings UI to show actual installed models.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const provider = searchParams.get('provider') || 'all'

        const results: {
            ollama: { available: boolean; models: string[]; error?: string }
            lmstudio: { available: boolean; models: string[]; error?: string }
        } = {
            ollama: { available: false, models: [] },
            lmstudio: { available: false, models: [] }
        }

        // Check Ollama
        if (provider === 'all' || provider === 'ollama') {
            try {
                const ollamaResponse = await fetch('http://localhost:11434/api/tags', {
                    signal: AbortSignal.timeout(5000)
                })
                if (ollamaResponse.ok) {
                    const data = await ollamaResponse.json()
                    results.ollama.available = true
                    // Extract model names, removing version tags for cleaner display
                    results.ollama.models = (data.models || []).map((m: any) => {
                        const name = m.name || m.model || ''
                        // Keep full name including tag (e.g., phi3:latest)
                        return name
                    }).filter(Boolean)
                } else {
                    results.ollama.error = `HTTP ${ollamaResponse.status}`
                }
            } catch (err: any) {
                results.ollama.error = err.name === 'TimeoutError'
                    ? 'Connection timeout - is Ollama running?'
                    : 'Cannot connect to Ollama at localhost:11434'
            }
        }

        // Check LM Studio
        if (provider === 'all' || provider === 'lmstudio') {
            try {
                const lmstudioResponse = await fetch('http://localhost:1234/v1/models', {
                    signal: AbortSignal.timeout(5000)
                })
                if (lmstudioResponse.ok) {
                    const data = await lmstudioResponse.json()
                    results.lmstudio.available = true
                    results.lmstudio.models = (data.data || []).map((m: any) => m.id).filter(Boolean)
                } else {
                    results.lmstudio.error = `HTTP ${lmstudioResponse.status}`
                }
            } catch (err: any) {
                results.lmstudio.error = err.name === 'TimeoutError'
                    ? 'Connection timeout - is LM Studio running?'
                    : 'Cannot connect to LM Studio at localhost:1234'
            }
        }

        return NextResponse.json(results)
    } catch (error) {
        console.error('Failed to detect local models:', error)
        return NextResponse.json({ error: 'Failed to detect local models' }, { status: 500 })
    }
}
