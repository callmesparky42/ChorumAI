
import dotenv from 'dotenv'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function runTest() {
    // Dynamic imports to ensure env is loaded
    const { db } = await import('@/lib/db')
    const { projects, projectLearningPaths, projectConfidence } = await import('@/lib/db/schema')
    const { recalculateProjectConfidence, initializeConfidence } = await import('@/lib/learning/manager')
    const { eq } = await import('drizzle-orm')

    const projectId = uuidv4()
    const userId = 'test-user-id' // We might need a real user if FK constraints exist?
    // checking schema: project.userId references users.id.
    // We probably need to find an existing user or create one.
    // For safety, let's try to find the first user in DB.

    console.log('🧪 Running Confidence Rescoring Integration Test...')

    const user = await db.query.users.findFirst()
    if (!user) {
        console.error('❌ No users found in DB. Cannot run integration test.')
        process.exit(1)
    }

    console.log(`Using user: ${user.email} (${user.id})`)

    // 1. Create Test Project
    console.log('Creating test project...')
    const [project] = await db.insert(projects).values({
        id: projectId,
        userId: user.id,
        name: 'Confidence Test Project',
        description: 'Temporary test project'
    }).returning()

    try {
        // 2. Init Confidence
        console.log('Initializing confidence...')
        await initializeConfidence(projectId)

        // 3. Add Learning Items
        console.log('Adding learning items...')

        // Item 1: Verified, Frequent (Provenance + Usage > 1)
        await db.insert(projectLearningPaths).values({
            projectId,
            type: 'pattern',
            content: 'Item 1',
            usageCount: 5,
            metadata: { provenance: { verifiedAt: '2023-01-01' } }
        })

        // Item 2: Unverified, Frequent (No Provenance + Usage > 1)
        await db.insert(projectLearningPaths).values({
            projectId,
            type: 'pattern',
            content: 'Item 2',
            usageCount: 3,
            metadata: {}
        })

        // Item 3: Verified, Infrequent (Provenance + Usage = 1)
        await db.insert(projectLearningPaths).values({
            projectId,
            type: 'pattern',
            content: 'Item 3',
            usageCount: 1,
            metadata: { provenance: { verifiedAt: '2023-01-01' } }
        })

        // Item 4: Unverified, Infrequent (No Provenance + Usage = 1)
        await db.insert(projectLearningPaths).values({
            projectId,
            type: 'pattern',
            content: 'Item 4',
            usageCount: 1,
            metadata: {}
        })

        // Stats Prediction:
        // Total: 4
        // Verified: 2 (Item 1, 3) -> Rate: 0.5
        // Recurring: 2 (Item 1, 2) -> Rate: 0.5
        // Interaction: Default 1.0 (since no interactions logged, code defaults to 1.0 or we need to check implementation)
        // Decay: 0.99 ^ 0 = 1.0

        // Formula:
        // 1.0 * 0.3 + 0.5 * 0.4 + 0.5 * 0.2 + 1.0 * 0.1
        // 0.3 + 0.2 + 0.1 + 0.1 = 0.7
        // Score: 70.00

        // Let's verify what interaction score defaults to.
        // My implementation: score = totalInteractions > 0 ? pos/total : 1.0
        // So it should be 1.0

        // 4. Run Recalculation
        console.log('Recalculating confidence...')
        const score = await recalculateProjectConfidence(projectId)

        console.log(`Calculated Score: ${score}`)

        if (Math.abs(score - 70.0) < 0.1) {
            console.log('✅ PASS: Score is ~70.0')
        } else {
            console.error(`❌ FAIL: Expected ~70.0, got ${score}`)
            process.exit(1)
        }

    } finally {
        // Cleanup
        console.log('Cleaning up...')
        await db.delete(projects).where(eq(projects.id, projectId))
    }
}

runTest().catch(e => {
    console.error(e)
    process.exit(1)
})
