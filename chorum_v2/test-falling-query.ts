import postgres from 'postgres';

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set");
        process.exit(1);
    }
    const dbUrl = process.env.DATABASE_URL!;
    const sql = postgres(dbUrl, { max: 1 });
    
    try {
        const dummyId = '00000000-0000-0000-0000-000000000000';
        console.log("Testing user_settings select...");
        try {
            await sql`select "customization" from "user_settings" where "user_settings"."id" = ${dummyId}`;
            console.log("Success (returned empty array or row)");
        } catch (err: any) {
            console.error("Postgres Error on user_settings select:", err.message, err.code, err.detail);
        }
        
        console.log("\nTesting api_tokens select...");
        try {
            await sql`select "id", "name", "scopes", "last_used_at", "expires_at", "revoked_at" from "api_tokens" where "api_tokens"."user_id" = ${dummyId}`;
            console.log("Success");
        } catch (err: any) {
            console.error("Postgres Error on api_tokens select:", err.message, err.code, err.detail);
        }
        
    } catch (e) {
        console.error("\nFATAL ERROR:");
        console.error(e);
    } finally {
        await sql.end();
    }
}
main();
