import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { providerCredentials, usageLog } from '@/lib/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'
import {
    getDefaultBaseUrl,
    MODEL_REGISTRY,
    getModelsForProvider,
    isProviderSupported
} from '@/lib/providers/registry'
import { writeProviderKeyToEnv } from '@/lib/env'

export async function GET(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        // Check for debug mode
        const { searchParams } = new URL(req.url)
        const debug = searchParams.get('debug') === 'true'

        const providers = await db.query.providerCredentials.findMany({
            where: and(
                eq(providerCredentials.userId, userId),
                eq(providerCredentials.isActive, true)
            ),
            orderBy: [desc(providerCredentials.model)]
        })

        // Debug mode: return raw provider/model info
        if (debug) {
            return NextResponse.json({
                message: 'Provider credentials (debug view)',
                providers: providers.map(p => ({
                    id: p.id,
                    provider: p.provider,
                    model: p.model,
                    displayName: p.displayName,
                    isLocal: p.isLocal
                }))
            })
        }

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

        const {
            provider,
            model,
            apiKey,
            dailyBudget,
            baseUrl,
            isLocal,
            displayName,
            capabilities: customCapabilities,
            costPer1M: customCost
        } = await req.json()

        if (!provider || !model) {
            return NextResponse.json({ error: 'Provider and model are required' }, { status: 400 })
        }

        // Local providers don't require API key
        const isLocalProvider = isLocal || (MODEL_REGISTRY[provider]?.category === 'local')
        if (!isLocalProvider && !apiKey) {
            return NextResponse.json({ error: 'API key required for cloud providers' }, { status: 400 })
        }

        // Get defaults from registry
        const registryEntry = MODEL_REGISTRY[provider]
        const registryModel = registryEntry?.models.find(m => m.id === model)

        // Fallback defaults if not found in registry (e.g. custom provider)
        const defaultCapabilities = registryModel?.capabilities || ['general']
        const defaultCost = registryModel?.cost
            ? { input: registryModel.cost.input, output: registryModel.cost.output }
            : { input: 0, output: 0 }

        const capabilities = customCapabilities || defaultCapabilities
        const costPer1M = customCost || defaultCost

        // Use placeholder for local providers without keys
        const encryptedKey = apiKey ? encrypt(apiKey) : encrypt('not-required')

        // Determine base URL
        const finalBaseUrl = baseUrl || getDefaultBaseUrl(provider)

        const [newProvider] = await db.insert(providerCredentials).values({
            userId,
            provider,
            model,
            apiKeyEncrypted: encryptedKey,
            dailyBudget: dailyBudget || '10.00',
            isActive: true,
            capabilities,
            costPer1M,
            baseUrl: finalBaseUrl,
            isLocal: isLocalProvider,
            displayName: displayName || null
        }).returning()

        // Write API key to .env.local for persistence (cloud providers only)
        if (apiKey && !isLocalProvider) {
            const envResult = await writeProviderKeyToEnv(provider, apiKey)
            if (!envResult.success) {
                console.warn(`[Providers] Failed to write to .env.local: ${envResult.error}`)
            }
        }

        return NextResponse.json({
            ...newProvider,
            apiKeyEncrypted: '••••••••'
        })
    } catch (error) {
        console.error('Failed to add provider:', error)
        return NextResponse.json({ error: 'Failed' }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const userId = session.user.id

        const {
            id,
            model,
            dailyBudget,
            baseUrl,
            isLocal,
            displayName,
            capabilities,
            costPer1M
        } = await req.json()

        if (!id) {
            return NextResponse.json({ error: 'Provider ID required' }, { status: 400 })
        }

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = {}
        if (model !== undefined) updateData.model = model
        if (dailyBudget !== undefined) updateData.dailyBudget = dailyBudget
        if (baseUrl !== undefined) updateData.baseUrl = baseUrl
        if (isLocal !== undefined) updateData.isLocal = isLocal
        if (displayName !== undefined) updateData.displayName = displayName
        if (capabilities !== undefined) updateData.capabilities = capabilities
        if (costPer1M !== undefined) updateData.costPer1M = costPer1M

        const [updated] = await db.update(providerCredentials)
            .set(updateData)
            .where(and(
                eq(providerCredentials.id, id),
                eq(providerCredentials.userId, userId)
            ))
            .returning()

        if (!updated) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        return NextResponse.json({
            ...updated,
            apiKeyEncrypted: '••••••••'
        })
    } catch (error) {
        console.error('Failed to update provider:', error)
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
