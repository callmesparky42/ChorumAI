import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function checkUser() {
    try {
        const user = await sql`
      SELECT id, name, email, security_settings, fallback_settings, memory_settings 
      FROM "user" 
      WHERE email = 'dmillsphoto@gmail.com' 
      LIMIT 1
    `;

        if (user.length === 0) {
            console.log('❌ User not found!');
        } else {
            console.log('✅ User exists:');
            console.log('   ID:', user[0].id);
            console.log('   Name:', user[0].name);
            console.log('   Email:', user[0].email);
            console.log('   Security Settings:', user[0].security_settings ? 'EXISTS' : 'NULL');
            console.log('   Fallback Settings:', user[0].fallback_settings ? 'EXISTS' : 'NULL');
            console.log('   Memory Settings:', user[0].memory_settings ? 'EXISTS' : 'NULL');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

checkUser();
