import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
        const tables = ['conversations', 'provider_configs', 'personas', 'projects'];
        for (const t of tables) {
            const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${t}`;
            console.log(`Table ${t} columns:`, cols.map(c => c.column_name).join(', '));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
