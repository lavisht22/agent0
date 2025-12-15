create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_old_runs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Delete runs older than 14 days
  DELETE FROM public.runs
  WHERE created_at < (now() - INTERVAL '14 days');
END;
$function$
;


