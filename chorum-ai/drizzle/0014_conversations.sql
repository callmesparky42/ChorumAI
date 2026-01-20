-- Add conversations table and link messages to conversations
-- This enables proper chat sessions with AI-generated titles

-- ============================================================================
-- CONVERSATIONS TABLE
-- Each conversation belongs to a project and has an AI-generated title
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by project
CREATE INDEX idx_conversations_project_id ON conversations(project_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- ============================================================================
-- ADD conversation_id TO MESSAGES
-- Nullable to maintain backward compatibility with existing messages
-- ============================================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Index for fast lookups by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- ============================================================================
-- ROW LEVEL SECURITY FOR CONVERSATIONS
-- Users can only access conversations in their own projects
-- ============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Select: Users can view conversations in projects they own
CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

-- Insert: Users can create conversations in projects they own
CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

-- Update: Users can update conversations in projects they own
CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

-- Delete: Users can delete conversations in projects they own
CREATE POLICY "conversations_delete" ON conversations
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );
