-- Seed built-in conductor apps.
-- These are first-party apps that ship with Chorum.
-- owner_id uses the dev user UUID; in production this would be the admin user.

INSERT INTO conductor_apps (slug, display_name, description, owner_id)
VALUES
  ('chorum-core', 'Chorum', 'Native Conductor learnings from chat sessions', '11111111-1111-1111-1111-111111111111'),
  ('chorum-health', 'Chorum Health', 'Health snapshot insights and checkup learnings', '11111111-1111-1111-1111-111111111111'),
  ('midnight-musings', 'Midnight Musings', 'Capture and reflection entries', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (slug) DO NOTHING;
