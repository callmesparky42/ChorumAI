
const postgres = require('postgres');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function run() {
    try {
        console.log('Adding images column to messages table...');
        await sql`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "images" jsonb;`;
        console.log('Successfully added images column.');
    } catch (err) {
        console.error('Error adding column:', err);
    } finally {
        await sql.end();
    }
}

run();
