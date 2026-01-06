import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const userProjects = await db.query.projects.findMany({
            where: eq(projects.userId, userId),
            orderBy: [desc(projects.createdAt)]
        })

        return NextResponse.json(userProjects)
    } catch (error) {
        console.error('Failed to fetch projects:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { name, description, techStack, customInstructions } = await req.json()

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        const [newProject] = await db.insert(projects).values({
            userId,
            name,
            description,
            techStack: techStack || [],
            customInstructions
        }).returning()

        return NextResponse.json(newProject)
    } catch (error) {
        console.error('Failed to create project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { searchParams } = new URL(req.url)
        const projectId = searchParams.get('id')

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        // Only delete if user owns the project
        await db.delete(projects).where(
            and(
                eq(projects.id, projectId),
                eq(projects.userId, userId)
            )
        )

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}
