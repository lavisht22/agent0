alter table "public"."runs" drop column "data";

alter table "public"."runs" add column "first_token_time" numeric not null;

alter table "public"."runs" add column "is_stream" boolean;

alter table "public"."runs" add column "pre_processing_time" numeric not null;

alter table "public"."runs" add column "response_time" numeric not null;

CREATE INDEX runs_created_at_idx ON public.runs USING btree (created_at);


  create policy "SELECT m44r3_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'runs-data'::text) AND public.is_workspace_reader(( SELECT r.workspace_id
   FROM public.runs r
  WHERE (r.id = objects.name)), auth.uid())));



