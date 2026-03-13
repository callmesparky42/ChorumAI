CREATE TABLE "learning_context_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"compiled_context" text NOT NULL,
	"token_estimate" integer NOT NULL,
	"learning_count" integer DEFAULT 0,
	"invariant_count" integer DEFAULT 0,
	"compiled_at" timestamp DEFAULT now(),
	"invalidated_at" timestamp,
	"compiler_model" text,
	CONSTRAINT "learning_cache_project_tier_unq" UNIQUE("project_id","tier")
);
--> statement-breakpoint
CREATE TABLE "mcp_server_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"transport_type" text NOT NULL,
	"command" text,
	"args" jsonb,
	"env" jsonb,
	"url" text,
	"headers" jsonb,
	"is_enabled" boolean DEFAULT true,
	"cached_tools" jsonb,
	"last_tool_refresh" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_hash" text NOT NULL,
	"content" text NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now(),
	"extracted_learning_ids" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "project_documents_project_hash" UNIQUE("project_id","content_hash")
);
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "api_tokens" DROP CONSTRAINT "api_tokens_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "authenticator" DROP CONSTRAINT "authenticator_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "custom_agents" DROP CONSTRAINT "custom_agents_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "learning_queue" DROP CONSTRAINT "learning_queue_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "mcp_interaction_log" DROP CONSTRAINT "mcp_interaction_log_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "pending_learnings" DROP CONSTRAINT "pending_learnings_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "provider_credentials" DROP CONSTRAINT "provider_credentials_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "routing_log" DROP CONSTRAINT "routing_log_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_log" DROP CONSTRAINT "usage_log_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "promoted_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "project_learning_paths" ADD COLUMN "muted_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "conductor_lens" numeric(3, 2) DEFAULT '1.00';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "focus_domains" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "domain_signal" jsonb;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN "context_window" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "serper_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "conductor_detailed_view" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "learning_context_cache" ADD CONSTRAINT "learning_context_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server_configs" ADD CONSTRAINT "mcp_server_configs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_learning_cache_project" ON "learning_context_cache" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "authenticator" ADD CONSTRAINT "authenticator_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "custom_agents" ADD CONSTRAINT "custom_agents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "learning_queue" ADD CONSTRAINT "learning_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mcp_interaction_log" ADD CONSTRAINT "mcp_interaction_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pending_learnings" ADD CONSTRAINT "pending_learnings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "routing_log" ADD CONSTRAINT "routing_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "usage_log" ADD CONSTRAINT "usage_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;