-- Phase 3: Add customization JSONB column to user_settings

ALTER TABLE user_settings
  ADD COLUMN customization JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN user_settings.customization IS
  'Per-user Phase 3 config: halfLifeOverrides, confidenceFloorOverrides, qualityThreshold';
