
import { ensureUserExists } from '../src/lib/user-init';
import { db } from '../src/lib/db';
import { users, projects } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function main() {
    const testId = randomUUID();
    const testEmail = `test-user-${testId}@example.com`;
    const testName = 'Test User';

    console.log(`Starting test for user: ${testEmail} (${testId})`);

    try {
        // Step 1: Initialize User
        console.log('Calling ensureUserExists...');
        const user = await ensureUserExists(testId, testEmail, testName);
        console.log('User created:', user.id);

        // Step 2: Verify User
        const [dbUser] = await db.select().from(users).where(eq(users.id, testId));
        if (!dbUser) throw new Error('User record not found in DB!');
        console.log('✅ User record verified.');

        // Step 3: Verify Project
        const userProjects = await db.select().from(projects).where(eq(projects.userId, testId));
        console.log(`Found ${userProjects.length} projects for user.`);

        if (userProjects.length === 0) {
            throw new Error('❌ NO PROJECTS FOUND! Implementation failed.');
        }

        const generalProject = userProjects.find(p => p.name === 'General');
        if (!generalProject) {
            throw new Error('❌ "General" project not found!');
        }
        console.log('✅ "General" project verified.');

        // Step 4: Re-run to ensure idempotency
        console.log('Running ensureUserExists again (idempotency check)...');
        await ensureUserExists(testId, testEmail, testName);
        const projectsAfter = await db.select().from(projects).where(eq(projects.userId, testId));
        if (projectsAfter.length !== userProjects.length) {
            throw new Error(`❌ Idempotency failed! Project count changed from ${userProjects.length} to ${projectsAfter.length}`);
        }
        console.log('✅ Idempotency verified.');

    } catch (error) {
        console.error('Test FAILED:', error);
        process.exit(1);
    } finally {
        // Cleanup
        console.log('Cleaning up...');
        await db.delete(users).where(eq(users.id, testId));
        console.log('Test user deleted.');
        process.exit(0);
    }
}

main();
