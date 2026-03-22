const postgres = require('postgres');
const sql = postgres('postgresql://postgres.koaraahsrjzjtntrcshd:2ZKsMddhgD0pX1Gu@aws-0-us-west-2.pooler.supabase.com:6543/postgres', { ssl: 'require' });

async function check() {
  try {
    const mcp = await sql`SELECT * FROM mcp_server_configs`;
    console.log('MCP server configs:', JSON.stringify(mcp, null, 2));

    const p = await sql`SELECT * FROM provider_credentials LIMIT 1`;
    console.log('Sample Provider:', JSON.stringify(p, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await sql.end();
  }
}
check();
