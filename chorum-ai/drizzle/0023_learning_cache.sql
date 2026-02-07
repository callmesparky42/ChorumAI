CREATE TABLE "learning_context_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "tier" integer NOT NULL,
  "compiled_context" text NOT NULL,
  "token_estimate" integer NOT NULL,
  "learning_count" integer NOT NULL DEFAULT 0,
  "invariant_count" integer NOT NULL DEFAULT 0,
  "compiled_at" timestamp DEFAULT now(),
  "invalidated_at" timestamp,
  "compiler_model" text,
  CONSTRAINT "learning_cache_project_tier_unq" UNIQUE("project_id", "tier")
);

CREATE INDEX "idx_learning_cache_project" ON learning_context_cache(project_id);

-- RLS: Users can only see cache for their projects
ALTER TABLE learning_context_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_cache_select" ON learning_context_cache
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "learning_cache_insert" ON learning_context_cache
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "learning_cache_update" ON learning_context_cache
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "learning_cache_delete" ON learning_context_cache
  FOR DELETE USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );
