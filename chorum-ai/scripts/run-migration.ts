import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function runMigration() {
  console.log('Running user table rename migration...');

  try {
    // Run migration in a transaction
    await sql.begin(async (tx) => {
      // Create new user table
      await tx`
        CREATE TABLE IF NOT EXISTS "user" (
          "id" text PRIMARY KEY NOT NULL,
          "name" text,
          "email" text NOT NULL,
          "emailVerified" timestamp,
          "image" text,
          "created_at" timestamp DEFAULT now(),
          CONSTRAINT "user_email_unique" UNIQUE("email")
        )
      `;
      console.log('Created user table');

      // Copy data from users to user (if users exists and has data)
      const usersExist = await tx`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'users'
        )
      `;

      if (usersExist[0].exists) {
        await tx`
          INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "created_at")
          SELECT "id", "name", "email", "emailVerified", "image", "created_at"
          FROM "users"
          ON CONFLICT DO NOTHING
        `;
        console.log('Copied data from users to user');

        // Drop old foreign key constraints
        await tx`ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_userId_users_id_fk"`;
        await tx`ALTER TABLE "authenticator" DROP CONSTRAINT IF EXISTS "authenticator_userId_users_id_fk"`;
        await tx`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_users_id_fk"`;
        await tx`ALTER TABLE "provider_credentials" DROP CONSTRAINT IF EXISTS "provider_credentials_user_id_users_id_fk"`;
        await tx`ALTER TABLE "routing_log" DROP CONSTRAINT IF EXISTS "routing_log_user_id_users_id_fk"`;
        await tx`ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_userId_users_id_fk"`;
        await tx`ALTER TABLE "usage_log" DROP CONSTRAINT IF EXISTS "usage_log_user_id_users_id_fk"`;
        console.log('Dropped old foreign key constraints');

        // Drop old users table
        await tx`DROP TABLE IF EXISTS "users" CASCADE`;
        console.log('Dropped old users table');
      }

      // Add new foreign key constraints pointing to user table
      await tx`ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_userId_user_id_fk"`;
      await tx`ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "authenticator" DROP CONSTRAINT IF EXISTS "authenticator_userId_user_id_fk"`;
      await tx`ALTER TABLE "authenticator" ADD CONSTRAINT "authenticator_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_user_id_user_id_fk"`;
      await tx`ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "provider_credentials" DROP CONSTRAINT IF EXISTS "provider_credentials_user_id_user_id_fk"`;
      await tx`ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "routing_log" DROP CONSTRAINT IF EXISTS "routing_log_user_id_user_id_fk"`;
      await tx`ALTER TABLE "routing_log" ADD CONSTRAINT "routing_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_userId_user_id_fk"`;
      await tx`ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      await tx`ALTER TABLE "usage_log" DROP CONSTRAINT IF EXISTS "usage_log_user_id_user_id_fk"`;
      await tx`ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action`;

      console.log('Added new foreign key constraints');
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
