/**
 * Analyze Links API
 * Triggers link inference for a project using co-occurrence data
 * POST /api/learning/analyze-links
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, providerCredentials } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { inferLinksForProject } from '@/lib/learning/link-inference'
import { decrypt } from '@/lib/crypto'
import { getCheapModel, BACKGROUND_PROVIDER_PREFERENCE } from '@/lib/providers/registry'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { projectId } = await req.json()

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        // Verify project ownership
        const project = await db.query.projects.findFirst({
            where: and(
                eq(projects.id, projectId),
                eq(projects.userId, session.user.id)
            )
        })

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        // ... existing imports ...

        // ... existing imports ...

        // ... existing code ...

        // Get user's cheapest CLOUD provider for inference (local providers won't work in production)
        const creds = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, session.user.id),
                eq(providerCredentials.isActive, true)
            )
        })

        // Filter out local providers - they won't work in production/Vercel
        const cloudCreds = creds.filter(c => !c.isLocal)

        let selectedProvider: { provider: string, apiKey: string, model: string, baseUrl?: string } | undefined

        // Helper
        const findProvider = (providerName: string) => {
            const cred = cloudCreds.find(c => c.provider === providerName)
            if (!cred) return undefined
            return {
                provider: cred.provider,
                apiKey: decrypt(cred.apiKeyEncrypted),
                model: getCheapModel(cred.provider),
                baseUrl: cred.baseUrl || undefined
            }
        }

        // 1. Try credentials in preference order
        for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
            const result = findProvider(provider)
            if (result) {
                selectedProvider = result
                break
            }
        }

        // 2. Fallback to Env vars
        if (!selectedProvider) {
            for (const provider of BACKGROUND_PROVIDER_PREFERENCE) {
                const envKey = `${provider.toUpperCase()}_API_KEY`

                // Special case for Google env var name mismatch if needed
                const apiKey = process.env[envKey] || (provider === 'google' ? process.env.GOOGLE_AI_API_KEY : undefined)

                if (apiKey) {
                    selectedProvider = {
                        provider,
                        apiKey,
                        model: getCheapModel(provider)
                    }
                    if (provider === 'google') {
                        // Compatibility with old code's return shape for google fallback
                        // But wait, we just need to set selectedProvider and break, then use it below.
                    }
                    break
                }
            }
        }

        if (!selectedProvider) {
            return NextResponse.json({
                error: 'No cloud providers configured. Add a cloud provider (Google, OpenAI, Anthropic, etc.) in Settings, or set environment API keys.'
            }, { status: 400 })
        }

        // Run link inference
        const result = await inferLinksForProject(projectId, {
            provider: selectedProvider.provider,
            apiKey: selectedProvider.apiKey,
            model: selectedProvider.model,
            baseUrl: selectedProvider.baseUrl,
            isLocal: false
        })

        return NextResponse.json({
            success: true,
            message: `Analyzed ${result.processed} co-occurrence pairs, created ${result.created} new links`,
            processed: result.processed,
            created: result.created
        })

    } catch (error) {
        console.error('[API] Link analysis failed:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Analysis failed' },
            { status: 500 }
        )
    }
}
