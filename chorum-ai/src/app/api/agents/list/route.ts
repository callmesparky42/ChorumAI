import { NextResponse } from 'next/server'
import { listAgents } from '@/lib/agents/registry'
import { auth } from '@/lib/auth'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const agents = await listAgents()
        return NextResponse.json({ agents })
    } catch (error) {
        console.error('Failed to list agents:', error)
        return NextResponse.json({ agents: [] })
    }
}
