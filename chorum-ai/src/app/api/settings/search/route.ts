import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const [user] = await db
            .select({
                memorySettings: users.memorySettings,
                serperApiKeyEncrypted: users.serperApiKeyEncrypted
            })
            .from(users)
            .where(eq(users.id, session.user.id))

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        const settings = user.memorySettings as { search?: { enabled: boolean; autoSearch: boolean } } | null

        return NextResponse.json({
            enabled: settings?.search?.enabled ?? false,
            autoSearch: settings?.search?.autoSearch ?? false,
            hasApiKey: !!user.serperApiKeyEncrypted
        })
    } catch (error) {
        console.error('[Settings] Failed to fetch search settings:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { apiKey, enabled, autoSearch } = await req.json()

        // Validation: If providing a key, test it first
        if (apiKey) {
            const isValid = await validateSerperKey(apiKey)
            if (!isValid) {
                return NextResponse.json({ error: 'Invalid Serper API Key' }, { status: 400 })
            }
        }

        // Get existing settings to merge
        const [user] = await db
            .select({ memorySettings: users.memorySettings })
            .from(users)
            .where(eq(users.id, session.user.id))

        const currentSettings = user?.memorySettings || {}
        const newSettings = {
            ...currentSettings,
            search: {
                enabled: enabled ?? (currentSettings as any).search?.enabled ?? false,
                provider: 'serper',
                autoSearch: autoSearch ?? (currentSettings as any).search?.autoSearch ?? false
            }
        }

        // Prepare update object
        const updateData: any = {
            memorySettings: newSettings
        }

        if (apiKey) {
            updateData.serperApiKeyEncrypted = encrypt(apiKey)
        }

        await db
            .update(users)
            .set(updateData)
            .where(eq(users.id, session.user.id))

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Settings] Failed to update search settings:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

async function validateSerperKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: 'test', num: 1 })
        })
        return response.ok
    } catch {
        return false
    }
}
