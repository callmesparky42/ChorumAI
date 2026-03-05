-- Phase 4: Provider configs + Personas

CREATE TABLE provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  model_override TEXT,
  base_url TEXT,
  is_local BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX provider_configs_user_idx ON provider_configs(user_id);
CREATE INDEX provider_configs_lookup_idx ON provider_configs(user_id, is_enabled, priority);

CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  default_provider TEXT,
  default_model TEXT,
  temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  scope_filter JSONB NOT NULL DEFAULT '{"include":[],"exclude":[],"boost":[]}',
  allowed_tools JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personas_user_idx ON personas(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX personas_system_idx ON personas(is_system) WHERE is_system = TRUE;
