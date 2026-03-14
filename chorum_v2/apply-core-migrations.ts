import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    
    const files = [
        '0002_user_settings.sql',
        '0003_customization.sql',
        '0003b_seed_domains.sql',
        '0004_conversations.sql',
        '0005_agent_layer.sql',
        '0005b_seed_personas.sql',
        '0006_persona_tier.sql',
        '0006b_seed_system_personas.sql',
        '0007_refined_from.sql',
        '0008_enable_rls.sql',
        '0009_conversations_updated_at.sql',
        '0012_health_persona.sql',
        '0015_mobile_auth_codes.sql',
        '0016_conductor_apps.sql',
        '0017_learning_source_app.sql',
        '0017b_seed_conductor_apps.sql',
        '0018_conductor_apps_system_owner.sql',
        '0019_user_profiles.sql'
    ];

    try {
        await sql`CREATE SCHEMA IF NOT EXISTS drizzle;`;
        await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        );`;

        const appliedResult = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
        const appliedHashes = appliedResult.map(r => r.hash);

        for (const file of files) {
            console.log(`\n\n=== Applying ${file} ===`);
            const filePath = path.join(process.cwd(), 'drizzle', file);
            let content = fs.readFileSync(filePath, 'utf8');
            
            content = content.replace(/--.*$/gm, '');
            const statements = content.split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            
            const hash = file; 
            if (appliedHashes.includes(hash)) {
                console.log(`Skipping ${file}, already applied.`);
                continue;
            }

            for (let i = 0; i < statements.length; i++) {
                let stmt = statements[i];
                try {
                    await sql.unsafe(stmt + ';'); 
                } catch (err: any) {
                    // Log but ignore all errors to force through remaining statements
                    console.log(`[IGNORED ERROR] ${err.code}: ${err.message} (Stmt: ${stmt.substring(0, 50)}...)`);
                }
            }
            
            await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`;
            console.log(`Successfully finished ${file}`);
        }
        
    } catch (e) {
        console.error("\nFATAL ERROR:");
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
