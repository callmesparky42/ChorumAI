-- Add images column to messages table for multi-modal support
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "images" jsonb;
