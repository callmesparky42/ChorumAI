import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

const sql = postgres(process.env.DATABASE_URL!);

interface ConversationHistoryItem {
    id: string;
    title: string;
    created: string;
    lastModified: string;
    objective?: string;
}

function extractTechStack(title: string, objective: string): string[] {
    const text = `${title} ${objective}`.toLowerCase();
    const techStack: string[] = [];

    const keywords: Record<string, string[]> = {
        'Next.js': ['next', 'nextjs', 'next.js'],
        'React': ['react'],
        'TypeScript': ['typescript', 'ts'],
        'Drizzle': ['drizzle'],
        'Supabase': ['supabase'],
        'PostgreSQL': ['postgres', 'postgresql', 'pg'],
        'Tailwind': ['tailwind'],
        'Vercel': ['vercel'],
        'Ollama': ['ollama'],
        'LLM': ['llm', 'anthropic', 'openai', 'claude', 'gpt'],
        'CLI': ['cli', 'command line'],
        'MCP': ['mcp'],
        'API': ['api']
    };

    for (const [tech, patterns] of Object.entries(keywords)) {
        if (patterns.some(pattern => text.includes(pattern))) {
            techStack.push(tech);
        }
    }

    return techStack.length > 0 ? techStack : ['General'];
}

async function importConversationHistory(email: string, dataFilePath: string) {
    console.log(`Starting import for user: ${email}`);

    try {
        // 1. Find user by email
        const userResult = await sql`
      SELECT id, name, email FROM "user" WHERE email = ${email} LIMIT 1
    `;

        if (userResult.length === 0) {
            throw new Error(`User not found: ${email}`);
        }

        const user = userResult[0];
        console.log(`Found user: ${user.name || user.email} (${user.id})`);

        // 2. Load conversation history data
        const rawData = fs.readFileSync(dataFilePath, 'utf-8');
        const conversationData: ConversationHistoryItem[] = JSON.parse(rawData);

        console.log(`Loaded ${conversationData.length} conversations from ${dataFilePath}`);

        let imported = 0;
        let skipped = 0;

        // 3. Import each conversation as a project
        for (const convo of conversationData) {
            try {
                // Check if project already exists by title
                const existing = await sql`
          SELECT id FROM projects WHERE name = ${convo.title} AND user_id = ${user.id} LIMIT 1
        `;

                if (existing.length > 0) {
                    console.log(`⏭️  Skipped: "${convo.title}" (already exists)`);
                    skipped++;
                    continue;
                }

                const techStack = extractTechStack(convo.title, convo.objective || '');
                const createdAt = new Date(convo.created);

                // Create project
                const projectResult = await sql`
          INSERT INTO projects (user_id, name, description, tech_stack, custom_instructions, created_at)
          VALUES (
            ${user.id},
            ${convo.title},
            ${convo.objective || `Imported conversation from ${createdAt.toLocaleDateString()}`},
            ${JSON.stringify(techStack)},
            ${convo.objective},
            ${createdAt}
          )
          RETURNING id
        `;

                const projectId = projectResult[0].id;
                console.log(`✅ Created project: "${convo.title}"`);

                // Create a conversation entry
                const convoResult = await sql`
          INSERT INTO conversations (project_id, title, created_at, updated_at)
          VALUES (
            ${projectId},
            ${convo.title},
            ${createdAt},
            ${new Date(convo.lastModified)}
          )
          RETURNING id
        `;

                // Create summary message if we have objective
                if (convo.objective) {
                    await sql`
            INSERT INTO messages (project_id, conversation_id, role, content, created_at)
            VALUES (
              ${projectId},
              ${convoResult[0].id},
              'assistant',
              ${'# Project Summary\n\n' + convo.objective},
              ${createdAt}
            )
          `;
                }

                imported++;
            } catch (error) {
                console.error(`❌ Error importing "${convo.title}":`, error);
            }
        }

        console.log(`\n✨ Import complete!`);
        console.log(`   Imported: ${imported}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Total: ${conversationData.length}`);

    } catch (error) {
        console.error('\n💥 Fatal error:', error);
        throw error;
    } finally {
        await sql.end();
    }
}

// Main execution
const email = process.argv[2] || 'dmillsphoto@gmail.com';
const dataFile = process.argv[3] || path.join(__dirname, 'conversation-history.json');

importConversationHistory(email, dataFile)
    .then(() => {
        console.log('\n🎉 Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n💥 Error:', err);
        process.exit(1);
    });
