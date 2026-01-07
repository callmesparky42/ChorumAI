ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "security_settings" jsonb;