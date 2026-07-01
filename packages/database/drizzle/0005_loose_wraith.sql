ALTER TABLE "runs" ADD COLUMN "log_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "run_logs_retention_days" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "run_metrics_retention_days" integer;