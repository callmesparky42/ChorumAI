import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Try multiple env file paths for different environments (local, CI, etc.)
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
}

export default {
    schema: './src/lib/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
} satisfies Config;
