-- Conductor Apps: connected app registry for provenance tracking
-- Each app that writes learnings into the Conductor registers with a unique slug.

CREATE TABLE IF NOT EXISTS conductor_apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  description   TEXT,
  icon_url      TEXT,
  api_key_hash  TEXT,
  owner_id      UUID NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_write_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS conductor_apps_owner_idx ON conductor_apps (owner_id);
CREATE INDEX IF NOT EXISTS conductor_apps_slug_idx ON conductor_apps (slug);
