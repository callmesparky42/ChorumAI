-- Phase 3 Addendum: Conversation tracking for the active memory loop

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT,
  scope_tags JSONB NOT NULL DEFAULT '[]',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  learnings_extracted INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX conversations_user_id_idx ON conversations(user_id);
CREATE INDEX conversations_started_at_idx ON conversations(user_id, started_at DESC);
CREATE INDEX conversations_project_id_idx ON conversations(project_id);
