-- Conductor's Podium: Schema additions for pin/mute controls, lens settings, focus domains
-- Migration: 0025_conductor_podium.sql

-- Add pin/mute timestamps to projectLearningPaths
ALTER TABLE project_learning_paths
ADD COLUMN pinned_at TIMESTAMP,
ADD COLUMN muted_at TIMESTAMP;

-- Add conductor settings to projects
ALTER TABLE projects
ADD COLUMN conductor_lens DECIMAL(3,2) DEFAULT 1.00,  -- 0.25 to 2.00 multiplier
ADD COLUMN focus_domains JSONB DEFAULT '[]';          -- Array of domain strings

-- Add detailed view preference to users
ALTER TABLE "user"
ADD COLUMN conductor_detailed_view BOOLEAN DEFAULT FALSE;
