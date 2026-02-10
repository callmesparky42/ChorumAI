import { NextRequest, NextResponse } from 'next/server'
import { auth, authFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, messages } from '@/lib/db/schema'
import { eq, desc, and, max } from 'drizzle-orm'

export async function GET(req: NextRequest) {
    try {
        // Support both Bearer token (mobile) and session (web) auth
        const session = await authFromRequest(req)

        // Development Bypass
        if (!session?.user?.id && process.env.NODE_ENV === 'development') {
            return NextResponse.json([
                {
                    id: 'mock-project-id',
                    name: 'Demo Project',
                    description: 'Local development project',
                    techStack: ['Next.js', 'TypeScript', 'Tailwind'],
                    customInstructions: 'Be helpful.',
                    createdAt: new Date().toISOString(),
                    lastMessageAt: new Date().toISOString()
                }
            ])
        }

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        // Fetch projects with last message timestamp for mobile project picker
        const userProjects = await db.query.projects.findMany({
            where: eq(projects.userId, userId),
            orderBy: [desc(projects.createdAt)]
        })

        // Get last message timestamps for each project
        const projectsWithActivity = await Promise.all(
            userProjects.map(async (project) => {
                const [lastMsg] = await db
                    .select({ createdAt: max(messages.createdAt) })
                    .from(messages)
                    .where(eq(messages.projectId, project.id))
                    .limit(1)

                return {
                    ...project,
                    lastMessageAt: lastMsg?.createdAt || project.createdAt
                }
            })
        )

        return NextResponse.json(projectsWithActivity)
    } catch (error) {
        console.error('Failed to fetch projects:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        // Support both Bearer token (mobile) and session (web) auth
        const session = await authFromRequest(req)
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
        // Support both Bearer token (mobile) and session (web) auth
        const session = await authFromRequest(req)
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

export async function PATCH(req: NextRequest) {
    try {
        // Support both Bearer token (mobile) and session (web) auth
        const session = await authFromRequest(req)
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const { id, name, description, customInstructions, techStack } = await req.json()

        if (!id) {
            return NextResponse.json({ error: 'Project ID required' }, { status: 400 })
        }

        const [updatedProject] = await db.update(projects)
            .set({
                name,
                description,
                customInstructions,
                techStack
            })
            .where(
                and(
                    eq(projects.id, id),
                    eq(projects.userId, userId)
                )
            )
            .returning()

        if (!updatedProject) {
            return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 })
        }

        return NextResponse.json(updatedProject)
    } catch (error) {
        console.error('Failed to update project:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}
