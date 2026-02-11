import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { parseConversationExport } from '@/lib/portability/parsers'
import { analyzeImportedConversations } from '@/lib/portability/analyzeImport'
import { analyzeProjectDomain } from '@/lib/chorum/domainSignal'
import { getCheapestProvider } from '@/lib/providers/cheapest'
import { storeNormalizedConversations } from '@/lib/portability/store'

/**
 * Import and Analyze Conversations
 *
 * POST /api/import/analyze
 *
 * Body: {
 *   projectId: string,
 *   data: object,
 *   storeConversations?: boolean,
 *   maxConversations?: number
 * }
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    try {
        const body = await req.json()
        const { projectId, data, storeConversations = false, maxConversations } = body

        if (!projectId || !data) {
            return NextResponse.json(
                { error: 'projectId and data are required' },
                { status: 400 }
            )
        }

        const project = await db.query.projects.findFirst({
            where: and(eq(projects.id, projectId), eq(projects.userId, userId))
        })
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const parseResult = parseConversationExport(data)

        if (parseResult.format === 'chorum') {
            return NextResponse.json(
                { error: 'Detected Chorum native format. Use POST /api/import/project instead.' },
                { status: 400 }
            )
        }

        if (parseResult.conversations.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No conversations found in import data',
                parseWarnings: parseResult.warnings
            }, { status: 400 })
        }

        if (storeConversations) {
            await storeNormalizedConversations(projectId, parseResult.conversations)
        }

        const providerConfig = await getCheapestProvider(userId)
        if (!providerConfig) {
            return NextResponse.json(
                { error: 'No active provider configured. Add at least one provider to analyze imports.' },
                { status: 400 }
            )
        }

        const analysisResult = await analyzeImportedConversations(
            parseResult.conversations,
            {
                projectId,
                providerConfig,
                userId,
                maxConversations,
                focusDomains: project.focusDomains ?? []
            }
        )

        if (storeConversations) {
            await analyzeProjectDomain(projectId)
        } else {
            await db.update(projects)
                .set({
                    domainSignal: {
                        primary: analysisResult.domainSignal.primary,
                        domains: analysisResult.domainSignal.domains,
                        conversationsAnalyzed: analysisResult.domainSignal.conversationsAnalyzed,
                        computedAt: analysisResult.domainSignal.computedAt.toISOString()
                    }
                })
                .where(eq(projects.id, projectId))
        }

        return NextResponse.json({
            success: true,
            format: parseResult.format,
            domainSignal: analysisResult.domainSignal,
            stats: {
                conversationsProcessed: analysisResult.conversationsProcessed,
                conversationsSkipped: analysisResult.conversationsSkipped,
                learningsStored: analysisResult.learningsStored,
                duplicatesFound: analysisResult.duplicatesFound,
                learningsMerged: analysisResult.learningsMerged,
                errors: analysisResult.errors
            },
            parseWarnings: parseResult.warnings
        })

    } catch (error) {
        console.error('[ImportAnalyze] API error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        )
    }
}
