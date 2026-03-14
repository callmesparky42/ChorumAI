import fs from 'fs';
const text = fs.readFileSync('drizzle/0010_health_schema.sql', 'utf8');
const pos = 1740;
console.log(text.substring(pos - 50, pos + 50));
