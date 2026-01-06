ALTER TABLE "provider_credentials" ADD COLUMN "base_url" text;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN "is_local" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN "display_name" text;