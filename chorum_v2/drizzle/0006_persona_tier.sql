-- Add tier column to personas table
-- 'thinking' | 'balanced' | 'fast' | NULL (treated as 'balanced')
ALTER TABLE personas ADD COLUMN IF NOT EXISTS tier text;
