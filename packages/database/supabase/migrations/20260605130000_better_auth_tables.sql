-- Phase 2 step 3: better-auth's own tables.
--
-- better-auth handles ONLY the browser-session credential (email-OTP login +
-- bearer session token). It connects via the direct Postgres connection
-- (DATABASE_URL, as the table-owner role) and manages these tables itself; the
-- existing `public.users` table is reused as its user model (already extended
-- in 20260605120000). Column shapes mirror better-auth's CLI-generated Drizzle
-- schema for v1.6.14 (core + emailOTP + bearer): plain `timestamp` (no tz, as
-- better-auth emits) and `uuid` ids matching public.users.id.
--
-- These tables hold session tokens and credential material, so they are kept
-- OFF the Supabase data API entirely: RLS is enabled with no policies and no
-- grants to anon/authenticated. Only the table-owner (better-auth's connection)
-- and service_role can touch them. RLS is dormant defense-in-depth.

create table "public"."sessions" (
    "id" uuid not null default gen_random_uuid(),
    "expires_at" timestamp not null,
    "token" text not null,
    "created_at" timestamp not null default now(),
    "updated_at" timestamp not null default now(),
    "ip_address" text,
    "user_agent" text,
    "user_id" uuid not null
);

create table "public"."accounts" (
    "id" uuid not null default gen_random_uuid(),
    "account_id" text not null,
    "provider_id" text not null,
    "user_id" uuid not null,
    "access_token" text,
    "refresh_token" text,
    "id_token" text,
    "access_token_expires_at" timestamp,
    "refresh_token_expires_at" timestamp,
    "scope" text,
    "password" text,
    "created_at" timestamp not null default now(),
    "updated_at" timestamp not null default now()
);

create table "public"."verifications" (
    "id" uuid not null default gen_random_uuid(),
    "identifier" text not null,
    "value" text not null,
    "expires_at" timestamp not null,
    "created_at" timestamp not null default now(),
    "updated_at" timestamp not null default now()
);

alter table "public"."sessions" enable row level security;
alter table "public"."accounts" enable row level security;
alter table "public"."verifications" enable row level security;

CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);
CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);
CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);
CREATE INDEX accounts_user_id_idx ON public.accounts USING btree (user_id);

CREATE UNIQUE INDEX verifications_pkey ON public.verifications USING btree (id);
CREATE INDEX verifications_identifier_idx ON public.verifications USING btree (identifier);

alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";
alter table "public"."sessions" add constraint "sessions_token_key" UNIQUE using index "sessions_token_key";
alter table "public"."sessions" add constraint "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."sessions" validate constraint "sessions_user_id_fkey";

alter table "public"."accounts" add constraint "accounts_pkey" PRIMARY KEY using index "accounts_pkey";
alter table "public"."accounts" add constraint "accounts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
alter table "public"."accounts" validate constraint "accounts_user_id_fkey";

alter table "public"."verifications" add constraint "verifications_pkey" PRIMARY KEY using index "verifications_pkey";

-- service_role only (Supabase admin tooling); anon/authenticated intentionally
-- get nothing so session tokens never surface through the data API.
grant delete, insert, references, select, trigger, truncate, update on table "public"."sessions" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table "public"."accounts" to "service_role";
grant delete, insert, references, select, trigger, truncate, update on table "public"."verifications" to "service_role";
