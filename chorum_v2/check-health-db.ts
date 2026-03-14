import postgres from 'postgres';

async function main() {
    console.log("HEALTH_DATABASE_URL:", process.env.HEALTH_DATABASE_URL ? "Set" : "Not Set");
    const sql = postgres(process.env.HEALTH_DATABASE_URL, { max: 1 });
    
    try {
        const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log("Tables in health database:");
        console.log(result.map(r => r.table_name).join(', '));

        const migrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5`.catch(() => []);
        console.log("Recent migrations in health database:");
        console.log(migrations);
    } catch (e) {
        console.error("Error connecting to health DB:");
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
