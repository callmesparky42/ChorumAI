import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '@/lib/crypto'
import { searchWithSerper, formatResultsForLLM } from './serper'
import type { ToolCallResult } from '@/lib/mcp-client/types'

export const WEB_SEARCH_TOOL_DEFINITION = {
    name: 'web_search',
    description: 'Search the internet for current information. Use this when you need up-to-date information about events, news, products, people, or any topic where your training data might be outdated.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'The search query. Be specific and include relevant keywords.'
            },
            num_results: {
                type: 'number',
                description: 'Number of results to return (1-10). Default is 5.'
            }
        },
        required: ['query']
    }
}

export async function executeWebSearch(
    userId: string,
    args: { query: string; num_results?: number }
): Promise<ToolCallResult> {
    try {
        // Get user's Serper API key
        const [user] = await db
            .select({ serperApiKeyEncrypted: users.serperApiKeyEncrypted })
            .from(users)
            .where(eq(users.id, userId))

        if (!user?.serperApiKeyEncrypted) {
            return {
                content: [{ type: 'text', text: 'Web search not configured. Please add your Serper API key in Settings.' }],
                isError: true
            }
        }

        const apiKey = decrypt(user.serperApiKeyEncrypted)

        console.log(`[Search] Querying Serper: "${args.query}"`)

        const results = await searchWithSerper(args.query, apiKey, {
            numResults: Math.min(args.num_results || 5, 10)
        })

        const formatted = formatResultsForLLM(results)

        console.log(`[Search] Found ${results.organic?.length || 0} results`)

        return {
            content: [{ type: 'text', text: formatted }],
            isError: false
        }
    } catch (error) {
        console.error('[Search] Serper error:', error)
        return {
            content: [{ type: 'text', text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}` }],
            isError: true
        }
    }
}

/**
 * Check if search is enabled for a user
 */
export async function isSearchEnabled(userId: string): Promise<boolean> {
    const [user] = await db
        .select({
            memorySettings: users.memorySettings,
            serperApiKeyEncrypted: users.serperApiKeyEncrypted
        })
        .from(users)
        .where(eq(users.id, userId))

    if (!user?.serperApiKeyEncrypted) return false

    const settings = user.memorySettings as { search?: { enabled: boolean } } | null
    return settings?.search?.enabled ?? false
}
