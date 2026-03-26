-- Rename versions table to agent_versions for consistency

-- Rename the table
ALTER TABLE public.versions RENAME TO agent_versions;

-- Rename constraints
ALTER TABLE public.agent_versions RENAME CONSTRAINT versions_pkey TO agent_versions_pkey;
ALTER TABLE public.agent_versions RENAME CONSTRAINT versions_agent_id_fkey TO agent_versions_agent_id_fkey;
ALTER TABLE public.agent_versions RENAME CONSTRAINT versions_user_id_fkey TO agent_versions_user_id_fkey;

-- Rename foreign keys on other tables that reference versions
ALTER TABLE public.agents RENAME CONSTRAINT agents_production_version_id_fkey TO agents_production_agent_version_id_fkey;
ALTER TABLE public.agents RENAME CONSTRAINT agents_staging_version_id_fkey TO agents_staging_agent_version_id_fkey;
ALTER TABLE public.runs RENAME CONSTRAINT runs_version_id_fkey TO runs_agent_version_id_fkey;

-- Rename indexes
ALTER INDEX versions_agent_id_idx RENAME TO agent_versions_agent_id_idx;
ALTER INDEX versions_agent_id_is_deployed_idx RENAME TO agent_versions_agent_id_is_deployed_idx;

-- Update the get_top_agents RPC function to reference agent_versions
CREATE OR REPLACE FUNCTION public.get_top_agents(
  p_workspace_id text,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT COALESCE(json_agg(agent_stats ORDER BY runs DESC), '[]'::json) INTO result
  FROM (
    SELECT
      a.id,
      a.name,
      COUNT(r.id) as runs,
      COUNT(r.id) FILTER (WHERE r.is_error = true) as errors,
      COALESCE(SUM(r.cost), 0) as cost
    FROM public.runs r
    INNER JOIN public.agent_versions v ON r.version_id = v.id
    INNER JOIN public.agents a ON v.agent_id = a.id
    WHERE r.workspace_id = p_workspace_id
      AND (p_start_date IS NULL OR r.created_at >= p_start_date)
      AND (p_end_date IS NULL OR r.created_at <= p_end_date)
    GROUP BY a.id, a.name
    ORDER BY runs DESC
    LIMIT p_limit
  ) agent_stats;

  RETURN result;
END;
$function$;
