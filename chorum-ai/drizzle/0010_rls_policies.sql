-- Row Level Security Policies for Chorum
-- Ensures users can only access their own data at the database level

-- ============================================================================
-- DIRECT userId TABLES
-- Tables that have a direct user_id column
-- ============================================================================

-- Provider Credentials: Users can only manage their own API keys
ALTER TABLE provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_credentials_select" ON provider_credentials
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "provider_credentials_insert" ON provider_credentials
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "provider_credentials_update" ON provider_credentials
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "provider_credentials_delete" ON provider_credentials
  FOR DELETE USING (user_id = auth.uid()::text);


-- Projects: Users can only manage their own projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (user_id = auth.uid()::text);


-- Routing Log: Users can only see their own routing decisions
ALTER TABLE routing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routing_log_select" ON routing_log
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "routing_log_insert" ON routing_log
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- No update/delete needed for logs (immutable)


-- Usage Log: Users can only see their own usage
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_log_select" ON usage_log
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "usage_log_insert" ON usage_log
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- No update/delete needed for logs (immutable)


-- ============================================================================
-- PROJECT-LINKED TABLES
-- Tables linked to projects (need subquery to check ownership)
-- ============================================================================

-- Messages: Users can only see messages from their projects
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "messages_delete" ON messages
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );


-- Memory Summaries: Users can only see summaries from their projects
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_summaries_select" ON memory_summaries
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "memory_summaries_insert" ON memory_summaries
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "memory_summaries_update" ON memory_summaries
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "memory_summaries_delete" ON memory_summaries
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );


-- Project Learning Paths: Users can only manage learning for their projects
ALTER TABLE project_learning_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_learning_paths_select" ON project_learning_paths
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_learning_paths_insert" ON project_learning_paths
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_learning_paths_update" ON project_learning_paths
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_learning_paths_delete" ON project_learning_paths
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );


-- Project Confidence: Users can only see confidence for their projects
ALTER TABLE project_confidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_confidence_select" ON project_confidence
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_confidence_insert" ON project_confidence
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_confidence_update" ON project_confidence
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_confidence_delete" ON project_confidence
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );


-- Project File Metadata: Users can only manage file metadata for their projects
ALTER TABLE project_file_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_file_metadata_select" ON project_file_metadata
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_file_metadata_insert" ON project_file_metadata
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_file_metadata_update" ON project_file_metadata
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "project_file_metadata_delete" ON project_file_metadata
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );


-- ============================================================================
-- AUTH TABLES (NextAuth managed)
-- These need special handling - service role bypasses RLS
-- ============================================================================

-- User table: Users can only see/update themselves
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own" ON "user"
  FOR SELECT USING (id = auth.uid()::text);

CREATE POLICY "user_update_own" ON "user"
  FOR UPDATE USING (id = auth.uid()::text);

-- Insert handled by NextAuth with service role


-- Account table: Users can only see their own OAuth accounts
ALTER TABLE account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_select" ON account
  FOR SELECT USING ("userId" = auth.uid()::text);

-- Insert/Update/Delete handled by NextAuth with service role


-- Session table: Users can only see their own sessions
ALTER TABLE session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_select" ON session
  FOR SELECT USING ("userId" = auth.uid()::text);

-- Managed by NextAuth


-- Authenticator table: Users can only see their own authenticators
ALTER TABLE authenticator ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticator_select" ON authenticator
  FOR SELECT USING ("userId" = auth.uid()::text);

-- Managed by NextAuth


-- ============================================================================
-- SERVICE ROLE BYPASS
-- The Supabase service role key bypasses RLS - used by NextAuth and server
-- This is already built into Supabase, no config needed
-- ============================================================================
