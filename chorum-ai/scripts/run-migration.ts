import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function runMigration() {
  console.log('Running cascade delete migration for project foreign keys...');

  try {
    await sql.begin(async (tx) => {
      // Drop existing constraints
      console.log('Dropping existing constraints...');
      await tx`ALTER TABLE "memory_summaries" DROP CONSTRAINT IF EXISTS "memory_summaries_project_id_projects_id_fk"`;
      await tx`ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_project_id_projects_id_fk"`;
      await tx`ALTER TABLE "routing_log" DROP CONSTRAINT IF EXISTS "routing_log_project_id_projects_id_fk"`;

      // Add new constraints with cascade delete
      console.log('Adding cascade delete constraints...');
      await tx`ALTER TABLE "memory_summaries" ADD CONSTRAINT "memory_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action`;
      await tx`ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action`;
      await tx`ALTER TABLE "routing_log" ADD CONSTRAINT "routing_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action`;

      console.log('Constraints updated successfully!');
    });

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
