-- Migration 0019: public.user_profiles
--
-- Creates a user identity table in the PUBLIC schema so that our NextAuth
-- JWT → UUID mapping has a home we can actually write to.
--
-- Supabase's auth.users table is owned by Supabase and the postgres role
-- cannot INSERT into it in managed projects. All FK references that used
-- auth.users.id are migrated here.
--
-- The `id` column stores the deterministic UUID derived from the OAuth
-- provider + subject via oauthSubToUuid() in src/lib/auth.ts.
-- ---------------------------------------------------------------------------

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            UUID PRIMARY KEY,
  oauth_provider TEXT NOT NULL,
  oauth_sub      TEXT NOT NULL,
  email          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_sub)
);

-- 2. RLS (defense-in-depth; API routes connect as postgres and bypass this)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY user_profiles_insert ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY user_profiles_update ON public.user_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 3. Migrate user_settings FK from auth.users → public.user_profiles
--    a. Drop the existing FK constraint (name from drizzle-kit snapshot)
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_id_fkey;
--    b. Add the new FK referencing public.user_profiles
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_id_fkey
  FOREIGN KEY (id) REFERENCES user_profiles(id) ON DELETE CASCADE;
