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

        // Get user's cheapest provider for inference
        const creds = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, session.user.id),
                eq(providerCredentials.isActive, true)
            )
        })

        if (creds.length === 0) {
            return NextResponse.json({
                error: 'No active providers configured. Add a provider in Settings.'
            }, { status: 400 })
        }

        // Sort by cost and use cheapest
        const sortedCreds = creds.sort((a, b) =>
            (Number(a.costInputPer1M) || 0) - (Number(b.costInputPer1M) || 0)
        )
        const cheapest = sortedCreds[0]

        // Decrypt API key
        const apiKey = cheapest.encryptedApiKey
            ? decrypt(cheapest.encryptedApiKey)
            : ''

        // Run link inference
        const result = await inferLinksForProject(projectId, {
            provider: cheapest.provider,
            apiKey,
            model: cheapest.model,
            baseUrl: cheapest.baseUrl || undefined,
            isLocal: cheapest.isLocal || false
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
