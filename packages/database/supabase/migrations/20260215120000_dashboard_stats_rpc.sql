-- RPC function to get dashboard stats efficiently without row limits
-- This calculates all statistics at the database level using aggregation

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_workspace_id text,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_runs', COALESCE(COUNT(*), 0),
    'successful_runs', COALESCE(COUNT(*) FILTER (WHERE is_error = false), 0),
    'failed_runs', COALESCE(COUNT(*) FILTER (WHERE is_error = true), 0),
    'success_rate', CASE
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE is_error = false)::numeric / COUNT(*)::numeric) * 100
      ELSE 0
    END,
    'total_cost', COALESCE(SUM(cost), 0),
    'total_tokens', COALESCE(SUM(tokens), 0),
    'avg_response_time', CASE
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(pre_processing_time + first_token_time + response_time), 0) / COUNT(*)
      ELSE 0
    END
  ) INTO result
  FROM public.runs
  WHERE workspace_id = p_workspace_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  RETURN result;
END;
$function$;

-- RPC function to get top agents by run count with aggregated stats
-- Returns top N agents with their runs, errors, and cost

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
    INNER JOIN public.versions v ON r.version_id = v.id
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
