-- MCP Server Mode Migration
-- Adds tables for API tokens, pending learnings, and interaction logging

-- API Tokens table
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT 'Default',
  permissions JSONB DEFAULT '{"read": true, "write": true, "projects": "all"}'::jsonb,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON api_tokens(token);

-- Pending learnings table
CREATE TABLE IF NOT EXISTS pending_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  context TEXT,
  source TEXT NOT NULL,
  source_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_learnings_user_status ON pending_learnings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_learnings_project ON pending_learnings(project_id);

-- MCP interaction log table
CREATE TABLE IF NOT EXISTS mcp_interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  query_type TEXT,
  tokens_returned INTEGER,
  items_returned INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_interaction_log_project ON mcp_interaction_log(project_id);

-- Add source column to existing learning paths
ALTER TABLE project_learning_paths ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web-ui';
