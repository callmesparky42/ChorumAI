-- Row Level Security for learning_queue and audit_logs tables
-- These tables were added after the initial RLS migration

-- ============================================================================
-- LEARNING QUEUE
-- Users can only manage their own learning queue items
-- Has both user_id (direct) and project_id (linked)
-- ============================================================================

ALTER TABLE learning_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_queue_select" ON learning_queue
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "learning_queue_insert" ON learning_queue
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "learning_queue_update" ON learning_queue
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "learning_queue_delete" ON learning_queue
  FOR DELETE USING (user_id = auth.uid()::text);


-- ============================================================================
-- AUDIT LOGS
-- Users can only see their own audit logs
-- ============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- No update/delete needed for audit logs (immutable for security)
