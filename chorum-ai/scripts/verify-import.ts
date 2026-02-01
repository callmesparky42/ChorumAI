import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function verifyImport() {
    console.log('Verifying imported projects for dmillsphoto@gmail.com...\n');

    try {
        // Get user
        const userResult = await sql`
      SELECT id, name, email FROM "user" WHERE email = 'dmillsphoto@gmail.com' LIMIT 1
    `;

        if (userResult.length === 0) {
            console.log('❌ User not found!');
            return;
        }

        const user = userResult[0];
        console.log(`✅ User found: ${user.name || user.email} (${user.id})\n`);

        // Count projects
        const projectCount = await sql`
      SELECT COUNT(*) as count FROM projects WHERE user_id = ${user.id}
    `;

        console.log(`📊 Total projects: ${projectCount[0].count}\n`);

        // Get sample of projects with conversations
        const projects = await sql`
      SELECT 
        p.id,
        p.name,
        p.description,
        p.tech_stack,
        p.created_at,
        (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id) as conversation_count,
        (SELECT COUNT(*) FROM messages m WHERE m.project_id = p.id) as message_count
      FROM projects p
      WHERE p.user_id = ${user.id}
      ORDER BY p.created_at DESC
      LIMIT 5
    `;

        console.log('📋 Sample of imported projects:\n');
        for (const proj of projects) {
            console.log(`  • ${proj.name}`);
            console.log(`    Created: ${new Date(proj.created_at).toLocaleDateString()}`);
            console.log(`    Tech Stack: ${JSON.parse(proj.tech_stack).join(', ')}`);
            console.log(`    Conversations: ${proj.conversation_count}, Messages: ${proj.message_count}`);
            console.log('');
        }

        console.log('✅ Import verification complete!');

    } catch (error) {
        console.error('❌ Verification error:', error);
    } finally {
        await sql.end();
    }
}

verifyImport();
