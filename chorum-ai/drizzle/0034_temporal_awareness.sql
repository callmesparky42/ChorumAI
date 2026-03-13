-- Temporal Awareness: per-project conversation tracking + per-item staleness config
-- Run against: core Supabase project

-- Track the last time a conversation occurred in each project.
-- Used by the Conductor to tell the model how long it's been since last engagement.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_conversation_at timestamptz;

-- Per-item staleness threshold in days.
-- null = never stale (default for invariants, anchors).
-- When set, items older than this value (without recent usage) get a staleness warning label.
ALTER TABLE project_learning_paths ADD COLUMN IF NOT EXISTS decays_after_days integer;

CREATE INDEX IF NOT EXISTS idx_projects_last_conversation
  ON projects(last_conversation_at)
  WHERE last_conversation_at IS NOT NULL;
