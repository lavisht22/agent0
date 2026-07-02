ALTER TABLE "runs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
CREATE INDEX "runs_metadata_idx" ON "runs" USING gin ("metadata" jsonb_path_ops) WHERE (metadata IS NOT NULL);