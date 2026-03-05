import { db } from './src/db'
import { personas } from './src/db/schema'
async function run() {
    const p = await db.select().from(personas)
    console.log(JSON.stringify(p, null, 2))
    process.exit(0)
}
run().catch(e => { console.error(e); process.exit(1); })
