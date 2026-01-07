ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "base_url" text;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "is_local" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN IF NOT EXISTS "display_name" text;