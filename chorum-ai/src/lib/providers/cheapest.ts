import { db } from '@/lib/db'
import { providerCredentials } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { and, eq } from 'drizzle-orm'
import type { FullProviderConfig } from './index'

export async function getCheapestProvider(userId: string): Promise<FullProviderConfig | null> {
    const creds = await db.query.providerCredentials.findMany({
        where: and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.isActive, true)
        )
    })

    if (creds.length === 0) return null

    const sorted = [...creds].sort((a, b) => {
        const aLocal = a.isLocal ? 0 : 1
        const bLocal = b.isLocal ? 0 : 1
        if (aLocal !== bLocal) return aLocal - bLocal

        const aCost = a.costPer1M?.input ?? Number.POSITIVE_INFINITY
        const bCost = b.costPer1M?.input ?? Number.POSITIVE_INFINITY
        return aCost - bCost
    })

    const selected = sorted[0]
    if (!selected) return null

    return {
        provider: selected.provider,
        apiKey: decrypt(selected.apiKeyEncrypted),
        model: selected.model,
        baseUrl: selected.baseUrl || undefined,
        isLocal: selected.isLocal || false
    }
}
