/**
 * Export Project API
 * Endpoint: POST /api/export/project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exportProject } from '@/lib/portability/exporter'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { projectId, options } = body

        if (!projectId) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
        }

        const payload = await exportProject(session.user.id, projectId, options)

        // Create filename based on project name and date
        // Sanitize project name
        const sanitizedTitle = payload.project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const date = new Date().toISOString().split('T')[0]
        const filename = `chorum_project_${sanitizedTitle}_${date}.json`

        // Return as downloadable file
        return new NextResponse(JSON.stringify(payload, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error('Export failed:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Export failed' },
            { status: 500 }
        )
    }
}
