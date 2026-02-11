import { db } from '@/lib/db'
import { conversations, messages } from '@/lib/db/schema'
import { v4 as uuidv4 } from 'uuid'
import type { NormalizedConversation } from './parsers'

export async function storeNormalizedConversations(
    projectId: string,
    conversationsInput: NormalizedConversation[]
): Promise<void> {
    for (const conv of conversationsInput) {
        const convId = uuidv4()

        await db.insert(conversations).values({
            id: convId,
            projectId,
            title: conv.title || null,
            createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
            updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date()
        })

        if (conv.messages.length > 0) {
            await db.insert(messages).values(
                conv.messages.map(msg => ({
                    projectId,
                    conversationId: convId,
                    role: msg.role,
                    content: msg.content,
                    provider: msg.provider || 'imported',
                    createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date()
                }))
            )
        }
    }
}
