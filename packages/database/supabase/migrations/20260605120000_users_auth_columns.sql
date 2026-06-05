-- Phase 2 (Supabase -> self-contained) step 1: prepare public.users for better-auth.
--
-- Today public.users is { id, name, created_at } and email lives ONLY in
-- Supabase's auth.users. better-auth will become the system of record for
-- identity, so we extend public.users with the columns it expects, preserving
-- the existing UUIDs (all FKs -- workspace_user.user_id, runs, providers,
-- personal_access_tokens, ... -- continue to point at public.users.id).
--
-- This migration is deliberately additive and reversible, and is shipped BEFORE
-- any Drizzle/better-auth code so the schema change is isolated and reviewable.
-- better-auth's own session/account/verification tables are NOT created here --
-- they are generated from better-auth's CLI when it is wired up, to match its
-- exact expected schema.
--
-- No new signups will go through Supabase Auth from here on (all new accounts
-- come through the better-auth flow), so the auth.users -> public.users
-- insert_user() trigger is dropped rather than patched -- one less piece of the
-- old auth coupling.

-- 1. Add the columns (email nullable for now; tightened to NOT NULL after backfill).
alter table "public"."users"
  add column if not exists "email" text,
  add column if not exists "email_verified" boolean not null default false,
  add column if not exists "updated_at" timestamp with time zone not null default now(),
  add column if not exists "image" text;

-- 2. Backfill email from auth.users by id. These are established accounts that
--    have been using the app, so mark them verified (no forced re-verification).
update "public"."users" u
set
  "email" = au."email",
  "email_verified" = true
from "auth"."users" au
where au."id" = u."id"
  and u."email" is null;

-- 3. Drop the Supabase-Auth signup hook. New accounts now come through the
--    better-auth flow (which writes public.users directly), so this trigger and
--    its function are no longer needed. Trigger first, then the function it used.
drop trigger if exists "create_user_after_insert_user" on "auth"."users";
drop function if exists "public"."insert_user"();

-- 4. Enforce uniqueness + presence. Wrapped in the migration's transaction, so an
--    orphan row (a public.users with no matching auth.users) rolls the whole
--    thing back and leaves prod untouched rather than half-migrated.
create unique index if not exists "users_email_key" on "public"."users" using btree ("email");

alter table "public"."users" alter column "email" set not null;
