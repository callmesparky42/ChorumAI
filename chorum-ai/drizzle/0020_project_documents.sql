-- Migration: Add project_documents table for file upload consent gate
-- This table stores persistent documents uploaded to projects (non-ephemeral)

CREATE TABLE IF NOT EXISTS "project_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
    "filename" text NOT NULL,
    "content_hash" text NOT NULL,
    "content" text NOT NULL,
    "mime_type" text NOT NULL,
    "uploaded_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "uploaded_at" timestamp DEFAULT now(),
    "extracted_learning_ids" jsonb DEFAULT '[]',
    "status" text NOT NULL DEFAULT 'active',
    "metadata" jsonb
);

-- Unique constraint to prevent duplicate uploads (same project + same content hash)
CREATE UNIQUE INDEX IF NOT EXISTS "project_documents_project_hash" ON "project_documents" ("project_id", "content_hash");

-- Index for faster lookups by project
CREATE INDEX IF NOT EXISTS "project_documents_project_idx" ON "project_documents" ("project_id");

-- Index for status filtering
CREATE INDEX IF NOT EXISTS "project_documents_status_idx" ON "project_documents" ("status");

-- RLS Policies (if RLS is enabled on the database)
-- Allow users to see only documents from their own projects
-- Note: These policies depend on how your RLS is set up

-- DROP POLICY IF EXISTS "project_documents_select_policy" ON "project_documents";
-- CREATE POLICY "project_documents_select_policy" ON "project_documents"
--     FOR SELECT USING (
--         EXISTS (
--             SELECT 1 FROM "projects"
--             WHERE "projects"."id" = "project_documents"."project_id"
--             AND "projects"."user_id" = auth.uid()
--         )
--     );

-- DROP POLICY IF EXISTS "project_documents_insert_policy" ON "project_documents";
-- CREATE POLICY "project_documents_insert_policy" ON "project_documents"
--     FOR INSERT WITH CHECK (
--         EXISTS (
--             SELECT 1 FROM "projects"
--             WHERE "projects"."id" = "project_documents"."project_id"
--             AND "projects"."user_id" = auth.uid()
--         )
--     );

-- DROP POLICY IF EXISTS "project_documents_update_policy" ON "project_documents";
-- CREATE POLICY "project_documents_update_policy" ON "project_documents"
--     FOR UPDATE USING (
--         EXISTS (
--             SELECT 1 FROM "projects"
--             WHERE "projects"."id" = "project_documents"."project_id"
--             AND "projects"."user_id" = auth.uid()
--         )
--     );

-- DROP POLICY IF EXISTS "project_documents_delete_policy" ON "project_documents";
-- CREATE POLICY "project_documents_delete_policy" ON "project_documents"
--     FOR DELETE USING (
--         EXISTS (
--             SELECT 1 FROM "projects"
--             WHERE "projects"."id" = "project_documents"."project_id"
--             AND "projects"."user_id" = auth.uid()
--         )
--     );
