import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Ensures a user record exists in the database with default settings.
 * This is called after authentication to create the application user record.
 * 
 * @param userId - Supabase auth user ID
 * @param email - User's email address
 * @param name - User's display name (optional)
 * @returns The user record (existing or newly created)
 */
export async function ensureUserExists(
    userId: string,
    email: string,
    name?: string | null
) {
    // Check if user already exists
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId))

    if (existingUser) {
        return existingUser
    }

    // Create new user with default settings
    console.log(`[User Init] Creating new user record for: ${email}`)

    const [newUser] = await db.insert(users).values({
        id: userId,
        email: email,
        name: name || email.split('@')[0] || 'User',
        bio: null,
        securitySettings: {
            enforceHttps: false,
            anonymizePii: false,
            strictSsl: false,
            logAllRequests: false
        },
        fallbackSettings: {
            enabled: true,
            defaultProvider: null,
            localFallbackModel: null,
            priorityOrder: []
        },
        memorySettings: {
            autoLearn: true,
            learningMode: 'async',
            injectContext: true,
            autoSummarize: true,
            validateResponses: true,
            smartAgentRouting: true
        },
        onboardingCompleted: false,
        onboardingStep: 0
    }).returning()

    console.log(`[User Init] User record created successfully: ${userId}`)
    return newUser
}
