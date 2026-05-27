-- Personal access tokens (PATs) for human/CLI users.
--
-- Distinct from api_keys: PATs are user-bound (every PAT has both a workspace
-- and a user), whereas api_keys are workspace-bound machine identities.
-- The dual-auth middleware in apps/runner/src/lib/auth.ts grants PATs the
-- effective scope set "*:*:*" (inheriting the user's full workspace
-- permissions), and gates mutating endpoints with a requireUserId guard so
-- that api_keys cannot reach them.
--
-- Storage: only the sha256 hash of the raw token is persisted. The raw token
-- is shown to the user exactly once (at mint time). `token_prefix` stores the
-- leading bytes ("agent0_pat_XXXX") so the dashboard can display tokens
-- without ever holding the secret.

  create table "public"."personal_access_tokens" (
    "id" text not null,
    "user_id" uuid not null,
    "workspace_id" text not null,
    "token_hash" text not null,
    "token_prefix" text not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone
      );


alter table "public"."personal_access_tokens" enable row level security;

CREATE UNIQUE INDEX personal_access_tokens_pkey ON public.personal_access_tokens USING btree (id);

CREATE UNIQUE INDEX personal_access_tokens_token_hash_key ON public.personal_access_tokens USING btree (token_hash);

CREATE INDEX personal_access_tokens_user_id_idx ON public.personal_access_tokens USING btree (user_id);

CREATE INDEX personal_access_tokens_workspace_id_idx ON public.personal_access_tokens USING btree (workspace_id);

alter table "public"."personal_access_tokens" add constraint "personal_access_tokens_pkey" PRIMARY KEY using index "personal_access_tokens_pkey";

alter table "public"."personal_access_tokens" add constraint "personal_access_tokens_token_hash_key" UNIQUE using index "personal_access_tokens_token_hash_key";

alter table "public"."personal_access_tokens" add constraint "personal_access_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."personal_access_tokens" validate constraint "personal_access_tokens_user_id_fkey";

alter table "public"."personal_access_tokens" add constraint "personal_access_tokens_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."personal_access_tokens" validate constraint "personal_access_tokens_workspace_id_fkey";

grant delete on table "public"."personal_access_tokens" to "anon";

grant insert on table "public"."personal_access_tokens" to "anon";

grant references on table "public"."personal_access_tokens" to "anon";

grant select on table "public"."personal_access_tokens" to "anon";

grant trigger on table "public"."personal_access_tokens" to "anon";

grant truncate on table "public"."personal_access_tokens" to "anon";

grant update on table "public"."personal_access_tokens" to "anon";

grant delete on table "public"."personal_access_tokens" to "authenticated";

grant insert on table "public"."personal_access_tokens" to "authenticated";

grant references on table "public"."personal_access_tokens" to "authenticated";

grant select on table "public"."personal_access_tokens" to "authenticated";

grant trigger on table "public"."personal_access_tokens" to "authenticated";

grant truncate on table "public"."personal_access_tokens" to "authenticated";

grant update on table "public"."personal_access_tokens" to "authenticated";

grant delete on table "public"."personal_access_tokens" to "service_role";

grant insert on table "public"."personal_access_tokens" to "service_role";

grant references on table "public"."personal_access_tokens" to "service_role";

grant select on table "public"."personal_access_tokens" to "service_role";

grant trigger on table "public"."personal_access_tokens" to "service_role";

grant truncate on table "public"."personal_access_tokens" to "service_role";

grant update on table "public"."personal_access_tokens" to "service_role";


-- A user can read, create, update (revoke), and delete their own PATs in any
-- workspace they belong to. The runner uses the service_role key and bypasses
-- RLS entirely for the dual-auth lookup; these policies only apply to dashboard
-- queries authed as the end user.
  create policy "SELECT"
  on "public"."personal_access_tokens"
  as permissive
  for select
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "INSERT"
  on "public"."personal_access_tokens"
  as permissive
  for insert
  to authenticated
with check (((user_id = ( SELECT auth.uid() AS uid)) AND public.is_workspace_reader(workspace_id, ( SELECT auth.uid() AS uid))));



  create policy "UPDATE"
  on "public"."personal_access_tokens"
  as permissive
  for update
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)))
with check ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "DELETE"
  on "public"."personal_access_tokens"
  as permissive
  for delete
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)));
