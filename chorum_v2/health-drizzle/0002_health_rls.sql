-- Health RLS: users see only their own data
-- phi_audit_log: users can SELECT but NOT INSERT/UPDATE/DELETE (service role only writes)

ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi_audit_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens      ENABLE ROW LEVEL SECURITY;

-- health_snapshots: owner full access
CREATE POLICY "health_snapshots_owner_all"
  ON health_snapshots FOR ALL
  USING (user_id = auth.uid());

-- phi_audit_log: owner can read their own entries only; no writes via RLS
CREATE POLICY "phi_audit_owner_select"
  ON phi_audit_log FOR SELECT
  USING (user_id = auth.uid());
-- Writes go through service role key only — no INSERT/UPDATE/DELETE policy for authenticated users

-- push_tokens: owner full access
CREATE POLICY "push_tokens_owner_all"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid());
