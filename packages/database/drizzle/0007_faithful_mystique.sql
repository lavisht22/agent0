CREATE TYPE "public"."run_status" AS ENUM('success', 'error', 'aborted');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "status" "run_status" DEFAULT 'success' NOT NULL;--> statement-breakpoint
-- Backfill: existing rows are labelled 'success' by the column default; only the
-- ~error rows need correcting. Historical aborts are indistinguishable from
-- errors at the row level (the AbortError marker lives only in the S3 log), so
-- they stay classified as 'error' — only go-forward runs record 'aborted'.
-- Touches only is_error=true rows, so cost scales with error volume, not table size.
UPDATE "runs" SET "status" = 'error' WHERE "is_error" = true;