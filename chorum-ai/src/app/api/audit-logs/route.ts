import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exportAuditLogs } from '@/lib/security'

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const markdown = await exportAuditLogs(session.user.id)

        // Return as downloadable markdown file
        return new NextResponse(markdown, {
            status: 200,
            headers: {
                'Content-Type': 'text/markdown',
                'Content-Disposition': `attachment; filename="chorum-audit-log-${new Date().toISOString().split('T')[0]}.md"`
            }
        })
    } catch (error) {
        console.error('Failed to export audit logs:', error)
        return NextResponse.json({ error: 'Failed to export audit logs' }, { status: 500 })
    }
}
