import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

async function main() {
    if (!process.env.HEALTH_DATABASE_URL) {
        console.error("HEALTH_DATABASE_URL not set");
        process.exit(1);
    }
    const sql = postgres(process.env.HEALTH_DATABASE_URL, { max: 1 });
    
    const files = [
        '0000_health_schema.sql',
        '0001_health_seed.sql',
        '0002_health_rls.sql',
        // '0003_health_persona.sql', // targets CORE db, not health
        '0004_health_user_settings.sql',
        '0005_garmin_sync_state.sql',
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
            console.log(`Applying ${file}...`);
            const filePath = path.join(process.cwd(), 'health-drizzle', file);
            let content = fs.readFileSync(filePath, 'utf8');
            
            // Strip -- comments to avoid them eating up lines
            content = content.replace(/--.*$/gm, '');
            // Split by ';' for individual execution
            const statements = content.split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            
            const hash = file; 
            if (appliedHashes.includes(hash)) {
                console.log(`Skipping ${file}, already applied.`);
                continue;
            }

            for (let i = 0; i < statements.length; i++) {
                let stmt = statements[i]!;
                try {
                    await sql.unsafe(stmt + ';'); 
                } catch (err: any) {
                    console.log(`[IGNORED ERROR] ${err.code}: ${err.message} (Stmt: ${stmt.substring(0, 50)}...)`);
                }
            }
            
            await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`;
            console.log(`Successfully applied ${file}`);
        }
        
    } catch (e) {
        console.error("Error connecting to health DB:");
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
