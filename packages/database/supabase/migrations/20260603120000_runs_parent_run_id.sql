-- Link a sub-run to the run that invoked it (agent-as-tool). Plain nullable
-- column, intentionally without a foreign key: rows are recorded at run-end, so
-- a child sub-run is inserted before its parent's row exists — an enforced FK
-- would fail on insert. The link is used for building the run tree, not for
-- referential integrity.
alter table "public"."runs" add column "parent_run_id" "text";

create index "runs_parent_run_id_idx" on "public"."runs" using btree ("parent_run_id");
