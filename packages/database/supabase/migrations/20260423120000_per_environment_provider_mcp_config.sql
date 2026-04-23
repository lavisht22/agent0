-- Per-environment configuration for providers and MCP servers.
--
-- Renames the existing `encrypted_data` column to `encrypted_data_production` and
-- adds a nullable `encrypted_data_staging` column on both tables. When the staging
-- column is NULL, the production config is used for both environments at runtime.
--
-- ALTER TABLE ... RENAME COLUMN and ADD COLUMN (nullable, no default) are
-- metadata-only operations in PostgreSQL: no data is rewritten, no rows are
-- dropped, and references in indexes / constraints / RLS policies are updated
-- automatically. Existing encrypted blobs are preserved verbatim under the new
-- column name.

alter table "public"."providers" rename column "encrypted_data" to "encrypted_data_production";
alter table "public"."providers" add column "encrypted_data_staging" text;

alter table "public"."mcps" rename column "encrypted_data" to "encrypted_data_production";
alter table "public"."mcps" add column "encrypted_data_staging" jsonb;

-- Reshape `mcps.tools` from a flat array to per-environment buckets.
-- Existing rows have shape `[{name, description}, ...]`; rewrap them as
-- `{ production: [...] }`. Staging is implicitly null (key absent) because
-- staging configs do not exist yet — only added via the new toggle.
update "public"."mcps"
set "tools" = jsonb_build_object('production', "tools")
where "tools" is not null and jsonb_typeof("tools") = 'array';
