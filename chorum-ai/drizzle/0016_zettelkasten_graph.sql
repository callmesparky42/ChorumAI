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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "learning_cooccurrence" ADD CONSTRAINT "learning_cooccurrence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_cooccurrence" ADD CONSTRAINT "learning_cooccurrence_item_a_project_learning_paths_id_fk" FOREIGN KEY ("item_a") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_cooccurrence" ADD CONSTRAINT "learning_cooccurrence_item_b_project_learning_paths_id_fk" FOREIGN KEY ("item_b") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_links" ADD CONSTRAINT "learning_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_links" ADD CONSTRAINT "learning_links_from_id_project_learning_paths_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_links" ADD CONSTRAINT "learning_links_to_id_project_learning_paths_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."project_learning_paths"("id") ON DELETE cascade ON UPDATE no action;