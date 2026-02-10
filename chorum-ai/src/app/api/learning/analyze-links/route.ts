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

        // Get user's cheapest CLOUD provider for inference (local providers won't work in production)
        const creds = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, session.user.id),
                eq(providerCredentials.isActive, true)
            )
        })

        // Filter out local providers - they won't work in production/Vercel
        const cloudCreds = creds.filter(c => !c.isLocal)

        // If no cloud providers, try environment fallbacks
        if (cloudCreds.length === 0) {
            // Check for environment API keys
            if (process.env.GOOGLE_AI_API_KEY) {
                const result = await inferLinksForProject(projectId, {
                    provider: 'google',
                    apiKey: process.env.GOOGLE_AI_API_KEY,
                    model: 'gemini-2.0-flash',
                    isLocal: false
                })
                return NextResponse.json({
                    success: true,
                    message: `Analyzed ${result.processed} co-occurrence pairs, created ${result.created} new links`,
                    processed: result.processed,
                    created: result.created
                })
            }
            if (process.env.ANTHROPIC_API_KEY) {
                const result = await inferLinksForProject(projectId, {
                    provider: 'anthropic',
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    model: 'claude-3-haiku-20240307',
                    isLocal: false
                })
                return NextResponse.json({
                    success: true,
                    message: `Analyzed ${result.processed} co-occurrence pairs, created ${result.created} new links`,
                    processed: result.processed,
                    created: result.created
                })
            }
            if (process.env.OPENAI_API_KEY) {
                const result = await inferLinksForProject(projectId, {
                    provider: 'openai',
                    apiKey: process.env.OPENAI_API_KEY,
                    model: 'gpt-4o-mini',
                    isLocal: false
                })
                return NextResponse.json({
                    success: true,
                    message: `Analyzed ${result.processed} co-occurrence pairs, created ${result.created} new links`,
                    processed: result.processed,
                    created: result.created
                })
            }
            return NextResponse.json({
                error: 'No cloud providers configured. Add a cloud provider (Google, OpenAI, Anthropic, etc.) in Settings, or set environment API keys.'
            }, { status: 400 })
        }

        // Sort by cost and use cheapest cloud provider
        const sortedCreds = cloudCreds.sort((a, b) =>
            (a.costPer1M?.input || 0) - (b.costPer1M?.input || 0)
        )
        const cheapest = sortedCreds[0]

        // Decrypt API key
        const apiKey = cheapest.apiKeyEncrypted
            ? decrypt(cheapest.apiKeyEncrypted)
            : ''

        // Run link inference
        const result = await inferLinksForProject(projectId, {
            provider: cheapest.provider,
            apiKey,
            model: cheapest.model,
            baseUrl: cheapest.baseUrl || undefined,
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
