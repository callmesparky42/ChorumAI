-- Row Level Security for remaining unprotected tables
-- Resolves: rls_disabled_in_public lint errors from Supabase

-- ============================================================================
-- API TOKENS
-- Users can only manage their own API tokens
-- CRITICAL: Contains hashed tokens - must be locked down
-- ============================================================================

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_tokens_select" ON api_tokens
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "api_tokens_insert" ON api_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "api_tokens_update" ON api_tokens
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "api_tokens_delete" ON api_tokens
  FOR DELETE USING (user_id = auth.uid()::text);


-- ============================================================================
-- CUSTOM AGENTS
-- Users can only manage their own custom agent definitions
-- ============================================================================

ALTER TABLE custom_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_agents_select" ON custom_agents
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "custom_agents_insert" ON custom_agents
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "custom_agents_update" ON custom_agents
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "custom_agents_delete" ON custom_agents
  FOR DELETE USING (user_id = auth.uid()::text);


-- ============================================================================
-- PENDING LEARNINGS
-- Users can only manage pending learnings they submitted
-- Has both user_id (direct) and project_id (linked)
-- ============================================================================

ALTER TABLE pending_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_learnings_select" ON pending_learnings
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "pending_learnings_insert" ON pending_learnings
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "pending_learnings_update" ON pending_learnings
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "pending_learnings_delete" ON pending_learnings
  FOR DELETE USING (user_id = auth.uid()::text);


-- ============================================================================
-- MCP INTERACTION LOG
-- Users can only see interaction logs for their own activity
-- Immutable audit log - no update/delete
-- ============================================================================

ALTER TABLE mcp_interaction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_interaction_log_select" ON mcp_interaction_log
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "mcp_interaction_log_insert" ON mcp_interaction_log
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- No update/delete needed for interaction logs (immutable)


-- ============================================================================
-- VERIFICATION TOKEN
-- NextAuth managed table - enable RLS but no anon policies needed
-- Service role key (used by NextAuth) bypasses RLS automatically
-- ============================================================================

ALTER TABLE verification_token ENABLE ROW LEVEL SECURITY;

-- No policies needed: only accessed via service role key which bypasses RLS.
-- Enabling RLS with no policies means anon/authenticated users cannot access
-- this table directly via PostgREST, which is the desired behavior.
