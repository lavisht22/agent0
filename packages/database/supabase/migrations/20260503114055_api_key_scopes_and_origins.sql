-- API key scopes and allowed origins.
--
-- scopes: list of `entity:operation:target` strings. `*` is allowed as a
--   full segment value. Existing keys are backfilled with `{*:*:*}` so behavior
--   is unchanged. Empty array = key can do nothing.
-- allowed_origins: optional list of origins to validate the request `Origin`
--   header against. NULL = any origin allowed (server-to-server default).
--   Non-NULL = enforce allowlist.

ALTER TABLE "public"."api_keys"
    ADD COLUMN "scopes" text[] NOT NULL DEFAULT '{*:*:*}';

ALTER TABLE "public"."api_keys"
    ADD COLUMN "allowed_origins" text[];
