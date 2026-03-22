import postgres from 'postgres';

async function main() {
    // URL from Vercel screenshot (with 'n')
    const dbUrl = 'postgresql://postgres.djpjljativiewneyyxjf:Solongandthanksforallthefish!@aws-0-us-west-2.pooler.supabase.com:6543/postgres';
    const sql = postgres(dbUrl, { max: 1 });
    
    try {
        console.log("Testing connection to Vercel DB URL...");
        const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log("Tables in public schema:");
        console.log(result.map(r => r.table_name).join(', '));
    } catch (e: any) {
        console.error("Error connecting to DB URL from screenshot:");
        console.error(e.message);
    } finally {
        await sql.end();
    }
}
main();
