
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projectLearningPaths } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.id && process.env.NODE_ENV !== 'development') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 })
        }

        await db.delete(projectLearningPaths).where(eq(projectLearningPaths.id, id))

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Delete memory failed:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
