import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { providerCredentials, usageLog } from '@/lib/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const providers = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            ),
            orderBy: [desc(providerCredentials.model)]
        })

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const stats = await db.query.usageLog.findMany({
            where: and(
                eq(usageLog.userId, userId),
                gte(usageLog.date, today)
            )
        })

        const usageByProvider = stats.reduce((acc, log) => {
            acc[log.provider] = (acc[log.provider] || 0) + Number(log.costUsd)
            return acc
        }, {} as Record<string, number>)

        const safeProviders = providers.map(p => ({
            ...p,
            apiKeyEncrypted: '••••••••',
            spentToday: usageByProvider[p.provider] || 0
        }))

        return NextResponse.json(safeProviders)
    } catch (error) {
        console.error('Failed to fetch providers:', error)
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

        const { provider, model, apiKey, dailyBudget } = await req.json()

        if (!provider || !model || !apiKey) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
        }

        let capabilities = ['general']
        let costPer1M = { input: 10, output: 30 }

        if (provider === 'anthropic') {
            capabilities = ['deep_reasoning', 'code_generation', 'general']
            costPer1M = { input: 3, output: 15 }
        } else if (provider === 'google') {
            capabilities = ['cost_efficient', 'long_context', 'general']
            costPer1M = { input: 1.25, output: 5 }
        } else if (provider === 'openai') {
            capabilities = ['code_generation', 'structured_output', 'general']
            costPer1M = { input: 10, output: 30 }
        } else if (provider === 'mistral') {
            capabilities = ['cost_efficient', 'code_generation', 'general']
            costPer1M = { input: 2, output: 6 }
        } else if (provider === 'deepseek') {
            capabilities = ['code_generation', 'cost_efficient', 'general']
            costPer1M = { input: 0.14, output: 0.28 }
        }

        const encryptedKey = encrypt(apiKey)

        const [newProvider] = await db.insert(providerCredentials).values({
            userId,
            provider,
            model,
            apiKeyEncrypted: encryptedKey,
            dailyBudget: dailyBudget || '10.00',
            isActive: true,
            capabilities,
            costPer1M
        }).returning()

        return NextResponse.json({
            ...newProvider,
            apiKeyEncrypted: '••••••••'
        })
    } catch (error) {
        console.error('Failed to add provider:', error)
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
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

        await db.update(providerCredentials)
            .set({ isActive: false })
            .where(and(
                eq(providerCredentials.id, id),
                eq(providerCredentials.userId, userId)
            ))

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}
