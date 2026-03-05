-- Enable pgvector extension. Must run before any vector column DDL.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hashed_token" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_hashed_token_unique" UNIQUE("hashed_token")
);
--> statement-breakpoint
CREATE TABLE "conductor_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_id" uuid,
	"type" text NOT NULL,
	"confidence_delta" double precision NOT NULL,
	"rationale" text NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conductor_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cooccurrence" (
	"learning_a" uuid NOT NULL,
	"learning_b" uuid NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"positive_count" integer DEFAULT 0 NOT NULL,
	"negative_count" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cooccurrence_learning_a_learning_b_pk" PRIMARY KEY("learning_a","learning_b"),
	CONSTRAINT "ordered_pair" CHECK ("cooccurrence"."learning_a" < "cooccurrence"."learning_b")
);
--> statement-breakpoint
CREATE TABLE "domain_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"scope_tags" jsonb NOT NULL,
	"centroid_1536" vector(1536),
	"centroid_384" vector(384),
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"learning_count" integer DEFAULT 0 NOT NULL,
	"last_recomputed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"signal_keywords" jsonb NOT NULL,
	"preferred_types" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "domain_seeds_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "embeddings_1536" (
	"learning_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings_384" (
	"learning_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(384) NOT NULL,
	"model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_id" uuid,
	"conversation_id" uuid,
	"injection_id" uuid,
	"signal" text NOT NULL,
	"source" text NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injection_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"learning_id" uuid,
	"included" boolean NOT NULL,
	"score" double precision NOT NULL,
	"reason" text,
	"exclude_reason" text,
	"tier_used" integer NOT NULL,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"strength" double precision DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_link" CHECK ("learning_links"."source_id" != "learning_links"."target_id")
);
--> statement-breakpoint
CREATE TABLE "learning_scopes" (
	"learning_id" uuid NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "learning_scopes_learning_id_scope_pk" PRIMARY KEY("learning_id","scope")
);
--> statement-breakpoint
CREATE TABLE "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"confidence_base" double precision DEFAULT 0.5 NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"extraction_method" text NOT NULL,
	"source_conversation_id" uuid,
	"pinned_at" timestamp with time zone,
	"muted_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confidence_invariant" CHECK ("learnings"."confidence" <= "learnings"."confidence_base"),
	CONSTRAINT "confidence_range" CHECK ("learnings"."confidence" >= 0 AND "learnings"."confidence" <= 1),
	CONSTRAINT "confidence_base_range" CHECK ("learnings"."confidence_base" >= 0 AND "learnings"."confidence_base" <= 1)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"scope_filter" jsonb DEFAULT '{"include":[],"exclude":[]}'::jsonb NOT NULL,
	"domain_cluster_id" uuid,
	"cross_lens_access" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conductor_proposals" ADD CONSTRAINT "conductor_proposals_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooccurrence" ADD CONSTRAINT "cooccurrence_learning_a_learnings_id_fk" FOREIGN KEY ("learning_a") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooccurrence" ADD CONSTRAINT "cooccurrence_learning_b_learnings_id_fk" FOREIGN KEY ("learning_b") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings_1536" ADD CONSTRAINT "embeddings_1536_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings_384" ADD CONSTRAINT "embeddings_384_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injection_audit" ADD CONSTRAINT "injection_audit_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_links" ADD CONSTRAINT "learning_links_source_id_learnings_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_links" ADD CONSTRAINT "learning_links_target_id_learnings_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_scopes" ADD CONSTRAINT "learning_scopes_learning_id_learnings_id_fk" FOREIGN KEY ("learning_id") REFERENCES "public"."learnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_active_idx" ON "api_tokens" USING btree ("hashed_token");--> statement-breakpoint
CREATE INDEX "conductor_queue_pending_idx" ON "conductor_queue" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "conductor_queue_locked_idx" ON "conductor_queue" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "feedback_user_unprocessed_idx" ON "feedback" USING btree ("user_id","processed");--> statement-breakpoint
CREATE INDEX "injection_audit_user_time_idx" ON "injection_audit" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_scopes_scope_idx" ON "learning_scopes" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "learning_scopes_learning_idx" ON "learning_scopes" USING btree ("learning_id");--> statement-breakpoint
CREATE INDEX "learnings_user_id_idx" ON "learnings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learnings_team_id_idx" ON "learnings" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "learnings_confidence_idx" ON "learnings" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "learnings_type_idx" ON "learnings" USING btree ("type");
--> statement-breakpoint
-- ANN indexes for semantic search.
-- lists = 100 is correct for ~10K rows (IVFFlat rule: lists ≈ sqrt(N)).
-- Note: queries require SET ivfflat.probes = 10 (or higher) for recall.
-- HNSW migration path available at >500K rows (see NEBULA_SCHEMA_SPEC.md).
CREATE INDEX embeddings_1536_ann_idx ON embeddings_1536 USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX embeddings_384_ann_idx  ON embeddings_384  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "injection_audit" ADD CONSTRAINT "injection_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "domain_clusters" ADD CONSTRAINT "domain_clusters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES auth.users(id) ON DELETE CASCADE;
