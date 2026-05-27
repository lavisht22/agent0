-- Detach personal access tokens from workspaces.
--
-- PATs are now user-bound only: a single PAT can be used against any workspace
-- the holder is a member of. The dual-auth middleware in apps/runner/src/lib/auth.ts
-- now resolves the workspace from the `:workspaceId` path param (T0.3) and looks
-- up the user's `workspace_user.role` per request, so the column on this table
-- and the workspace half of the INSERT RLS check are both vestigial.

-- The INSERT policy references workspace_id via is_workspace_reader, so it has
-- to be dropped before the column can go.
drop policy if exists "INSERT" on "public"."personal_access_tokens";

alter table "public"."personal_access_tokens"
  drop constraint if exists "personal_access_tokens_workspace_id_fkey";

drop index if exists "public"."personal_access_tokens_workspace_id_idx";

alter table "public"."personal_access_tokens" drop column "workspace_id";

-- Recreate INSERT with just the user-identity check; SELECT/UPDATE/DELETE
-- policies already only check user_id and need no change.
create policy "INSERT"
  on "public"."personal_access_tokens"
  as permissive
  for insert
  to authenticated
with check ((user_id = ( SELECT auth.uid() AS uid)));
