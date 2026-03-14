-- 0014_health_user_settings.sql
-- Per-user health preferences table.
-- Separate from garmin_sync_state (credentials) so settings can be written
-- independently of whether the user has connected a wearable.
-- Run against HEALTH_DATABASE_URL.

CREATE TABLE IF NOT EXISTS health_user_settings (
  user_id           uuid PRIMARY KEY,
  retention_days    integer NOT NULL DEFAULT 0,   -- 0 = retain forever
  alert_thresholds  text,                          -- JSON: AlertThresholds config
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE health_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_user_settings_owner" ON health_user_settings
  FOR ALL USING (user_id = auth.uid());
