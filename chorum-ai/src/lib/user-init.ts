import { db } from '@/lib/db'
import { users, projects } from '@/lib/db/schema'
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
    // First check by ID (fast path - user already synced)
    const [existingById] = await db.select().from(users).where(eq(users.id, userId))

    if (existingById) {
        return existingById
    }

    // Check if user exists by email (handles ID mismatch from auth migration)
    const [existingByEmail] = await db.select().from(users).where(eq(users.email, email))

    if (existingByEmail) {
        // User exists with different ID - update to new Supabase auth ID
        console.log(`[User Init] Updating user ID for ${email}: ${existingByEmail.id} -> ${userId}`)

        const [updatedUser] = await db.update(users)
            .set({ id: userId })
            .where(eq(users.email, email))
            .returning()

        return updatedUser
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

    console.log(`[User Init] User record created/verified: ${userId}`)

    // Check for existing projects
    const existingProjects = await db.select().from(projects).where(eq(projects.userId, userId)).limit(1)

    if (existingProjects.length === 0) {
        console.log(`[User Init] No projects found for ${userId}, creating default 'General' project`)
        await db.insert(projects).values({
            userId: userId,
            name: 'General',
            description: 'Default project for general conversations',
            techStack: [],
            customInstructions: null
        })
        console.log(`[User Init] Default project created for ${userId}`)
    }

    return newUser
}
