-- Add onboarding tracking columns to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "onboarding_step" integer DEFAULT 0;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "onboarding_data" jsonb;

-- Create index for quick onboarding status checks
CREATE INDEX IF NOT EXISTS "user_onboarding_completed_idx" ON "user" ("onboarding_completed");

-- Comment for documentation
COMMENT ON COLUMN "user"."onboarding_completed" IS 'Whether user has completed the onboarding wizard';
COMMENT ON COLUMN "user"."onboarding_step" IS 'Current onboarding step (0=not started, 1-5=in progress)';
COMMENT ON COLUMN "user"."onboarding_data" IS 'JSON data tracking onboarding progress and configuration';
