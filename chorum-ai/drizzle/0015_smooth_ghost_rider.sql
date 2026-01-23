ALTER TABLE "project_learning_paths" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "domains" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "usage_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarding_completed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarding_step" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarding_data" jsonb;