-- Add source_app column to learnings table for provenance tracking.
-- FK-lite to conductor_apps.slug; nullable (core learnings default to 'chorum-core').

ALTER TABLE learnings ADD COLUMN IF NOT EXISTS source_app TEXT;

-- Backfill: all existing learnings are from the core app
UPDATE learnings SET source_app = 'chorum-core' WHERE source_app IS NULL;
