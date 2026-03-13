-- NOTE: originally referenced auth.users; updated in 0019 to reference user_profiles.
-- If applying fresh (no prior run), user_profiles must be created first (0019 part 1).
CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" uuid PRIMARY KEY NOT NULL REFERENCES user_profiles("id") ON DELETE CASCADE,
    "end_of_session_judge_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
