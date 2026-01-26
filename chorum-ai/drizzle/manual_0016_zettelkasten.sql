-- Manual migration for Zettelkasten graph tables
-- Run this directly in Supabase SQL Editor if drizzle push/migrate fails

-- Drop if exists (in case partial migration occurred)
DROP TABLE IF EXISTS "learning_cooccurrence" CASCADE;
DROP TABLE IF EXISTS "learning_links" CASCADE;

-- Create learning_links table
CREATE TABLE "learning_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "from_id" uuid NOT NULL,
    "to_id" uuid NOT NULL,
    "link_type" text NOT NULL,
    "strength" numeric(3, 2) DEFAULT '0.5',
    "source" text DEFAULT 'inferred',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "learning_links_unq" UNIQUE("from_id","to_id","link_type")
);

-- Create learning_cooccurrence table
CREATE TABLE "learning_cooccurrence" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "project_id" uuid NOT NULL,
    "item_a" uuid NOT NULL,
    "item_b" uuid NOT NULL,
    "count" integer DEFAULT 1,
    "positive_count" integer DEFAULT 0,
    "last_seen" timestamp DEFAULT now(),
    CONSTRAINT "learning_cooccurrence_unq" UNIQUE("item_a","item_b")
);

-- Add foreign keys
ALTER TABLE "learning_links"
    ADD CONSTRAINT "learning_links_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;

ALTER TABLE "learning_links"
    ADD CONSTRAINT "learning_links_from_id_fk"
    FOREIGN KEY ("from_id") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade;

ALTER TABLE "learning_links"
    ADD CONSTRAINT "learning_links_to_id_fk"
    FOREIGN KEY ("to_id") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade;

ALTER TABLE "learning_cooccurrence"
    ADD CONSTRAINT "learning_cooccurrence_project_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;

ALTER TABLE "learning_cooccurrence"
    ADD CONSTRAINT "learning_cooccurrence_item_a_fk"
    FOREIGN KEY ("item_a") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade;

ALTER TABLE "learning_cooccurrence"
    ADD CONSTRAINT "learning_cooccurrence_item_b_fk"
    FOREIGN KEY ("item_b") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade;

-- Add indexes for performance (per spec)
CREATE INDEX IF NOT EXISTS "idx_links_from" ON "learning_links"("from_id");
CREATE INDEX IF NOT EXISTS "idx_links_to" ON "learning_links"("to_id");
CREATE INDEX IF NOT EXISTS "idx_links_project" ON "learning_links"("project_id");
CREATE INDEX IF NOT EXISTS "idx_links_type" ON "learning_links"("link_type");

CREATE INDEX IF NOT EXISTS "idx_cooccur_project" ON "learning_cooccurrence"("project_id");
CREATE INDEX IF NOT EXISTS "idx_cooccur_count" ON "learning_cooccurrence"("count" DESC);

-- Enable RLS (consistent with other tables)
ALTER TABLE "learning_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_cooccurrence" ENABLE ROW LEVEL SECURITY;

-- RLS policies (users can only access their own project data)
CREATE POLICY "learning_links_policy" ON "learning_links"
    FOR ALL
    USING (
        "project_id" IN (
            SELECT id FROM projects WHERE user_id = auth.uid()::text
        )
    );

CREATE POLICY "learning_cooccurrence_policy" ON "learning_cooccurrence"
    FOR ALL
    USING (
        "project_id" IN (
            SELECT id FROM projects WHERE user_id = auth.uid()::text
        )
    );

-- Verify tables created
SELECT 'learning_links' as table_name, count(*) as rows FROM learning_links
UNION ALL
SELECT 'learning_cooccurrence', count(*) FROM learning_cooccurrence;
