import { NextResponse } from 'next/server'
import { listAgents } from '@/lib/agents/registry'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { customAgents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get built-in agents
        const builtInAgents = await listAgents()

        // Get custom agents for this user
        const userCustomAgents = await db.query.customAgents.findMany({
            where: eq(customAgents.userId, session.user.id)
        })

        const combinedAgents = [
            ...builtInAgents,
            ...userCustomAgents.map(a => ({
                id: a.id,
                name: a.name,
                icon: a.config.icon,
                tier: a.config.tier,
                role: a.config.role,
                isCustom: true
            }))
        ]

        return NextResponse.json({ agents: combinedAgents })
    } catch (error) {
        console.error('Failed to list agents:', error)
        return NextResponse.json({ agents: [] })
    }
}
