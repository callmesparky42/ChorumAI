import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/customization/auth'
import { checkRateLimit } from '@/lib/shell/rate-limit'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

const BUCKETS = ['0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0'] as const

export async function GET(request: Request) {
    const authCtx = await authenticate(request)
    if (!authCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    checkRateLimit(authCtx.userId)

    const uid = authCtx.userId

    const [typeRows, confRows, scopeRows, injRows] = await Promise.all([
        db.execute(sql`
            SELECT type, COUNT(*)::int as count
            FROM learnings WHERE user_id = ${uid}
            GROUP BY type
        `),
        db.execute(sql`
            SELECT
                CASE
                    WHEN confidence < 0.2 THEN '0–0.2'
                    WHEN confidence < 0.4 THEN '0.2–0.4'
                    WHEN confidence < 0.6 THEN '0.4–0.6'
                    WHEN confidence < 0.8 THEN '0.6–0.8'
                    ELSE '0.8–1.0'
                END as bucket,
                COUNT(*)::int as count
            FROM learnings WHERE user_id = ${uid}
            GROUP BY bucket ORDER BY bucket
        `),
        db.execute(sql`
            SELECT ls.scope, COUNT(*)::int as count
            FROM learning_scopes ls
            JOIN learnings l ON l.id = ls.learning_id
            WHERE l.user_id = ${uid}
            GROUP BY ls.scope ORDER BY count DESC LIMIT 8
        `),
        db.execute(sql`
            SELECT DATE(created_at)::text as date, COUNT(*)::int as count
            FROM injection_audit
            WHERE user_id = ${uid}
              AND included = true
              AND created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `),
    ])

    const byType: Record<string, number> = {}
    for (const row of (typeRows as any[])) {
        byType[row.type] = Number(row.count)
    }

    const confMap: Record<string, number> = {}
    for (const row of (confRows as any[])) {
        confMap[row.bucket] = Number(row.count)
    }

    return NextResponse.json({
        totalLearnings: Object.values(byType).reduce((a, b) => a + b, 0),
        byType,
        confidenceDistribution: BUCKETS.map(bucket => ({ bucket, count: confMap[bucket] ?? 0 })),
        topScopes: (scopeRows as any[]).map(r => ({ scope: String(r.scope), count: Number(r.count) })),
        injectionsByDay: (injRows as any[]).map(r => ({ date: String(r.date), count: Number(r.count) })),
    })
}
