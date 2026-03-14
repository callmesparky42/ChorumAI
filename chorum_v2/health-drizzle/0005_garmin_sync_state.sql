-- 0005_garmin_sync_state.sql
-- Garmin Connect credentials + sync cursor + circuit breaker.
-- Run against HEALTH_DATABASE_URL.

CREATE TABLE IF NOT EXISTS garmin_sync_state (
  user_id               uuid PRIMARY KEY,
  encrypted_username    text NOT NULL,
  encrypted_password    text NOT NULL,
  creds_iv              text NOT NULL,
  last_sync_at          timestamptz,
  sync_cursor           text,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  circuit_open          boolean NOT NULL DEFAULT false,
  circuit_opened_at     timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE garmin_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "garmin_sync_owner" ON garmin_sync_state
  FOR ALL USING (user_id = auth.uid());
