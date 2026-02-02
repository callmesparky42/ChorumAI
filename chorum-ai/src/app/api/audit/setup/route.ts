
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users, projects } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
    try {
        const secret = req.headers.get('x-audit-bypass-secret');
        console.log('[Audit Setup] Request received. Secret:', secret);

        if (secret !== 'chorum-audit') {
            return NextResponse.json({ error: 'Unauthorized - Invalid Secret', received: secret }, { status: 401 })
        }

        const devUser = await db.query.users.findFirst()

        if (!devUser) {
            return NextResponse.json({ error: 'No users found in DB' }, { status: 404 })
        }

        let project = await db.query.projects.findFirst({
            where: (projects, { and, eq }) => and(
                eq(projects.userId, devUser.id),
                eq(projects.name, 'Cognitive Audit')
            )
        })

        if (!project) {
            const [newProject] = await db.insert(projects).values({
                userId: devUser.id,
                name: 'Cognitive Audit',
                description: 'Temporary workspace for cognitive audit',
                techStack: ['Audit']
            }).returning()
            project = newProject
        }

        return NextResponse.json({
            userId: devUser.id,
            projectId: project.id
        })
    } catch (e: any) {
        console.error('Audit Setup Error:', e);
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 })
    }
}
