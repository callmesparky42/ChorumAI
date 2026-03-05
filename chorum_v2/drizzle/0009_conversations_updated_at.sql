-- Migration 0009: Add updatedAt column to conversations table
-- Referenced by Shell actions (getConversationHistory, saveConversationMessages)
ALTER TABLE conversations
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: set updated_at to started_at for existing rows
UPDATE conversations SET updated_at = started_at WHERE updated_at = now();

-- Index for sorting conversations by most recently updated
CREATE INDEX conversations_updated_at_idx ON conversations (user_id, updated_at DESC);
