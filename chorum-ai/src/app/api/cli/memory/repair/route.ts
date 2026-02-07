
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths } from '@/lib/db/schema'
import { isNull, and, eq } from 'drizzle-orm'
import { embeddings } from '@/lib/chorum/embeddings'

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        // Allow CLI token auth (handled by middleware usually, but for now we rely on session or explicit token check if implemented)
        // Since this is /api/cli, we might need to check the token manually if middleware doesn't cover it or if we are using session.
        // For simplicity reusing the auth() session check which works if the CLI is logged in via browser flow or if we implement token-based auth here.
        // H4x0r CLI login usually gets a JWT.

        // Quick dev bypass for CLI if running locally
        if (!session?.user?.id && process.env.NODE_ENV === 'development') {
            // allow
        } else if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { projectId } = await req.json()

        const whereClause = projectId
            ? and(eq(projectLearningPaths.projectId, projectId), isNull(projectLearningPaths.embedding))
            : isNull(projectLearningPaths.embedding)

        const itemsToRepair = await db.select().from(projectLearningPaths).where(whereClause)

        if (itemsToRepair.length === 0) {
            return NextResponse.json({ updated: 0, failed: 0 })
        }

        let updated = 0
        let failed = 0

        for (const item of itemsToRepair) {
            try {
                const textToEmbed = item.context
                    ? `${item.content} ${item.context}`
                    : item.content

                const embedding = await embeddings.embed(textToEmbed, session?.user?.id)

                await db.update(projectLearningPaths)
                    .set({ embedding })
                    .where(eq(projectLearningPaths.id, item.id))

                updated++
            } catch (e) {
                console.error(`Failed to repair item ${item.id}:`, e)
                failed++
            }
        }

        return NextResponse.json({ updated, failed })

    } catch (error) {
        console.error('Memory repair failed:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
