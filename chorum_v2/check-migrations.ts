import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
        const migrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 25`;
        console.log("Applied migrations in core database:");
        console.log(migrations);
    } catch (e) {
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
