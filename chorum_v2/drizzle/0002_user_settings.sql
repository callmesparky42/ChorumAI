CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" uuid PRIMARY KEY NOT NULL REFERENCES auth.users("id") ON DELETE CASCADE,
    "end_of_session_judge_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
