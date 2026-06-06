-- Drop all RLS policies and disable row-level security on every public table.
--
-- Phase 3 of the Supabase -> self-contained migration. RLS only ever constrained
-- the `anon` / `authenticated` roles used by Supabase's Data API and the old
-- direct-from-browser Postgres access. Both are gone: browser data access was
-- removed in Phase 1, and the Supabase Data API is being switched off. The runner
-- connects as `postgres` / `service_role`, which both have rolbypassrls = true, so
-- these policies have been fully dormant. Removing them (and disabling RLS) moves
-- the database toward a clean, vanilla Postgres free of Supabase-specific
-- authorization machinery.
--
-- Intentionally KEPT (out of scope here):
--   * the is_workspace_reader/writer/admin helper functions — the live
--     `workspace_assign_owner_admin` INSERT trigger still calls is_workspace_admin;
--   * the `auth.uid()` column defaults on workspaces.user_id / agent_versions.user_id
--     — unused by the runner (it sets user_id explicitly) and removed when we leave
--     Supabase Postgres entirely in Phase 4.

-- ---------------------------------------------------------------------------
-- Drop policies (39 total, grouped by table)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "DELETE" ON public.agent_tags;
DROP POLICY IF EXISTS "INSERT" ON public.agent_tags;
DROP POLICY IF EXISTS "SELECT" ON public.agent_tags;
DROP POLICY IF EXISTS "UPDATE" ON public.agent_tags;

DROP POLICY IF EXISTS "INSERT" ON public.agent_versions;
DROP POLICY IF EXISTS "SELECT" ON public.agent_versions;
DROP POLICY IF EXISTS "UPDATE" ON public.agent_versions;

DROP POLICY IF EXISTS "DELETE" ON public.agents;
DROP POLICY IF EXISTS "INSERT" ON public.agents;
DROP POLICY IF EXISTS "SELECT" ON public.agents;
DROP POLICY IF EXISTS "UPDATE" ON public.agents;

DROP POLICY IF EXISTS "ALL" ON public.api_keys;

DROP POLICY IF EXISTS "DELETE" ON public.mcps;
DROP POLICY IF EXISTS "INSERT" ON public.mcps;
DROP POLICY IF EXISTS "SELECT" ON public.mcps;
DROP POLICY IF EXISTS "UPDATE" ON public.mcps;

DROP POLICY IF EXISTS "DELETE" ON public.personal_access_tokens;
DROP POLICY IF EXISTS "INSERT" ON public.personal_access_tokens;
DROP POLICY IF EXISTS "SELECT" ON public.personal_access_tokens;
DROP POLICY IF EXISTS "UPDATE" ON public.personal_access_tokens;

DROP POLICY IF EXISTS "DELETE" ON public.providers;
DROP POLICY IF EXISTS "INSERT" ON public.providers;
DROP POLICY IF EXISTS "SELECT" ON public.providers;
DROP POLICY IF EXISTS "UPDATE" ON public.providers;

DROP POLICY IF EXISTS "SELECT" ON public.runs;

DROP POLICY IF EXISTS "DELETE" ON public.tags;
DROP POLICY IF EXISTS "INSERT" ON public.tags;
DROP POLICY IF EXISTS "SELECT" ON public.tags;
DROP POLICY IF EXISTS "UPDATE" ON public.tags;

DROP POLICY IF EXISTS "SELECT" ON public.users;
DROP POLICY IF EXISTS "UPDATE" ON public.users;

DROP POLICY IF EXISTS "DELETE" ON public.workspace_user;
DROP POLICY IF EXISTS "INSERT" ON public.workspace_user;
DROP POLICY IF EXISTS "SELECT" ON public.workspace_user;
DROP POLICY IF EXISTS "UPDATE" ON public.workspace_user;

DROP POLICY IF EXISTS "DELETE" ON public.workspaces;
DROP POLICY IF EXISTS "INSERT" ON public.workspaces;
DROP POLICY IF EXISTS "SELECT" ON public.workspaces;
DROP POLICY IF EXISTS "UPDATE" ON public.workspaces;

-- ---------------------------------------------------------------------------
-- Disable RLS on every public table (15 — includes the better-auth tables,
-- which had RLS enabled with no policies)
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_access_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_user DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces DISABLE ROW LEVEL SECURITY;
