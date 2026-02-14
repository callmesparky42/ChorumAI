ALTER TABLE "learning_queue" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "learning_queue" ADD COLUMN "batch_label" text;--> statement-breakpoint
CREATE INDEX "learning_queue_batch_idx" ON "learning_queue" USING btree ("batch_id");