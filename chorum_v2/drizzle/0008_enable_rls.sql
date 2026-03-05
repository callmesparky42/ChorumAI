-- Migration 0008: Enable Row-Level Security on all user-facing tables
-- Defense-in-depth: the Drizzle ORM connects as `postgres` (table owner, bypasses RLS).
-- These policies protect against direct PostgREST / anon-key access paths.

-- ============================================================================
-- 1. USER-OWNED TABLES (user_id = auth.uid())
-- ============================================================================

-- learnings
ALTER TABLE learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnings_select ON learnings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY learnings_insert ON learnings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY learnings_update ON learnings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY learnings_delete ON learnings FOR DELETE TO authenticated USING (user_id = auth.uid());

-- feedback
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_select ON feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY feedback_insert ON feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON projects FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY projects_insert ON projects FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY projects_update ON projects FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY projects_delete ON projects FOR DELETE TO authenticated USING (user_id = auth.uid());

-- injection_audit
ALTER TABLE injection_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY injection_audit_select ON injection_audit FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY injection_audit_insert ON injection_audit FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- conductor_queue
ALTER TABLE conductor_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY conductor_queue_select ON conductor_queue FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY conductor_queue_insert ON conductor_queue FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY conductor_queue_update ON conductor_queue FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- conductor_proposals
ALTER TABLE conductor_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY conductor_proposals_select ON conductor_proposals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY conductor_proposals_insert ON conductor_proposals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY conductor_proposals_update ON conductor_proposals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- api_tokens
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_tokens_select ON api_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY api_tokens_insert ON api_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY api_tokens_update ON api_tokens FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY api_tokens_delete ON api_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- provider_configs
ALTER TABLE provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_configs_select ON provider_configs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY provider_configs_insert ON provider_configs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY provider_configs_update ON provider_configs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY provider_configs_delete ON provider_configs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- personas (system personas are readable by all authenticated users)
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY personas_select ON personas FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_system = true);
CREATE POLICY personas_insert ON personas FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY personas_update ON personas FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_system = false) WITH CHECK (user_id = auth.uid());
CREATE POLICY personas_delete ON personas FOR DELETE TO authenticated USING (user_id = auth.uid() AND is_system = false);

-- domain_clusters
ALTER TABLE domain_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY domain_clusters_select ON domain_clusters FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY domain_clusters_insert ON domain_clusters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY domain_clusters_update ON domain_clusters FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY domain_clusters_delete ON domain_clusters FOR DELETE TO authenticated USING (user_id = auth.uid());

-- conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_select ON conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY conversations_insert ON conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY conversations_update ON conversations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY conversations_delete ON conversations FOR DELETE TO authenticated USING (user_id = auth.uid());

-- user_settings (PK = auth.users.id, so id = auth.uid())
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_settings_select ON user_settings FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY user_settings_insert ON user_settings FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY user_settings_update ON user_settings FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2. FK-DEPENDENT TABLES (parent must be owned by caller)
-- ============================================================================

-- embeddings_1536
ALTER TABLE embeddings_1536 ENABLE ROW LEVEL SECURITY;
CREATE POLICY embeddings_1536_select ON embeddings_1536 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_1536.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY embeddings_1536_insert ON embeddings_1536 FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_1536.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY embeddings_1536_delete ON embeddings_1536 FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_1536.learning_id AND learnings.user_id = auth.uid()));

-- embeddings_384
ALTER TABLE embeddings_384 ENABLE ROW LEVEL SECURITY;
CREATE POLICY embeddings_384_select ON embeddings_384 FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_384.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY embeddings_384_insert ON embeddings_384 FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_384.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY embeddings_384_delete ON embeddings_384 FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = embeddings_384.learning_id AND learnings.user_id = auth.uid()));

-- learning_scopes
ALTER TABLE learning_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_scopes_select ON learning_scopes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_scopes.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY learning_scopes_insert ON learning_scopes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_scopes.learning_id AND learnings.user_id = auth.uid()));
CREATE POLICY learning_scopes_delete ON learning_scopes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_scopes.learning_id AND learnings.user_id = auth.uid()));

-- learning_links
ALTER TABLE learning_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_links_select ON learning_links FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_links.source_id AND learnings.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_links.target_id AND learnings.user_id = auth.uid())
  );
CREATE POLICY learning_links_insert ON learning_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_links.source_id AND learnings.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_links.target_id AND learnings.user_id = auth.uid())
  );
CREATE POLICY learning_links_delete ON learning_links FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM learnings WHERE learnings.id = learning_links.source_id AND learnings.user_id = auth.uid())
  );

-- cooccurrence
ALTER TABLE cooccurrence ENABLE ROW LEVEL SECURITY;
CREATE POLICY cooccurrence_select ON cooccurrence FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM learnings WHERE learnings.id = cooccurrence.learning_a AND learnings.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM learnings WHERE learnings.id = cooccurrence.learning_b AND learnings.user_id = auth.uid())
  );
CREATE POLICY cooccurrence_insert ON cooccurrence FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM learnings WHERE learnings.id = cooccurrence.learning_a AND learnings.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM learnings WHERE learnings.id = cooccurrence.learning_b AND learnings.user_id = auth.uid())
  );

-- ============================================================================
-- 3. SYSTEM-READ TABLES (read-only for authenticated, no writes via PostgREST)
-- ============================================================================

-- domain_seeds (system-managed; authenticated can read, only service_role writes)
ALTER TABLE domain_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY domain_seeds_select ON domain_seeds FOR SELECT TO authenticated USING (true);
