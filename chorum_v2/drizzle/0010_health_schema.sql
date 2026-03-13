-- Health Phase 1: Core PHI-isolated tables
-- Run against: HEALTH Supabase project (NOT core project)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- health_snapshots: append-only encrypted PHI store
CREATE TABLE IF NOT EXISTS health_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type               text NOT NULL,
  recorded_at        timestamptz NOT NULL,
  source             text NOT NULL,
  encrypted_payload  text NOT NULL,
  payload_iv         text NOT NULL,
  payload_hash       text NOT NULL,
  storage_path       text,
  created_at         timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT health_snapshots_type_check CHECK (
    type IN (
      'garmin_daily',
      'garmin_hrv',
      'labs',
      'icd_report',
      'vitals',
      'mychart',
      'checkup_result',
      'ocr_document'
    )
  ),
  CONSTRAINT health_snapshots_source_check CHECK (
    source IN ('garmin','health_connect','ocr','manual','mychart','file_upload','system')
  )
);

CREATE INDEX IF NOT EXISTS idx_health_snapshots_user_type ON health_snapshots (user_id, type);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_user_date ON health_snapshots (user_id, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_snapshots_dedup ON health_snapshots (user_id, payload_hash);

-- health_sources: trusted medical knowledge source registry
CREATE TABLE IF NOT EXISTS health_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  base_url    text NOT NULL,
  domain      text NOT NULL,
  trust_level int DEFAULT 1 NOT NULL,
  active      boolean DEFAULT true NOT NULL
);

-- phi_audit_log: HIPAA-required access log
-- Write access is service-role only (enforced by RLS in 0011)
CREATE TABLE IF NOT EXISTS phi_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  actor_id      text NOT NULL,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  ip_address    text,
  created_at    timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT phi_audit_action_check CHECK (
    action IN ('view','create','export','decrypt','delete','integrity_failure')
  )
);

CREATE INDEX IF NOT EXISTS idx_phi_audit_user ON phi_audit_log (user_id, created_at DESC);

-- push_tokens: Expo push notification device tokens (Phase 5 delivery)
CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text DEFAULT 'android' NOT NULL,
  active     boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
