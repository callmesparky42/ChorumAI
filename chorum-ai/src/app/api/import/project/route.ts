/**
 * Import Project API
 * Endpoint: POST /api/import/project
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { importProject } from '@/lib/portability/importer'
import { validateExportPayload } from '@/lib/portability/validator'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { exportData, options } = body

        if (!exportData) {
            return NextResponse.json({ error: 'Export data is required' }, { status: 400 })
        }

        // 1. Validate Schema
        const validation = validateExportPayload(exportData)
        if (!validation.valid || !validation.data) {
            return NextResponse.json({
                error: 'Invalid export file format',
                details: validation.error
            }, { status: 400 })
        }

        // 2. Perform Import
        const result = await importProject(session.user.id, validation.data, options || {})

        return NextResponse.json(result)

    } catch (error) {
        console.error('Import failed:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 500 }
        )
    }
}
