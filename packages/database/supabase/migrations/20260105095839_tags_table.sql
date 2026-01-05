
  create table "public"."agent_tags" (
    "agent_id" text not null,
    "tag_id" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."agent_tags" enable row level security;


  create table "public"."tags" (
    "id" text not null,
    "name" text not null,
    "color" text not null default '#6366f1'::text,
    "workspace_id" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."tags" enable row level security;

CREATE INDEX agent_tags_agent_id_idx ON public.agent_tags USING btree (agent_id);

CREATE UNIQUE INDEX agent_tags_pkey ON public.agent_tags USING btree (agent_id, tag_id);

CREATE INDEX agent_tags_tag_id_idx ON public.agent_tags USING btree (tag_id);

CREATE INDEX tags_workspace_id_idx ON public.tags USING btree (workspace_id);

CREATE UNIQUE INDEX tahs_pkey ON public.tags USING btree (id);

alter table "public"."agent_tags" add constraint "agent_tags_pkey" PRIMARY KEY using index "agent_tags_pkey";

alter table "public"."tags" add constraint "tahs_pkey" PRIMARY KEY using index "tahs_pkey";

alter table "public"."agent_tags" add constraint "agent_tags_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."agent_tags" validate constraint "agent_tags_agent_id_fkey";

alter table "public"."agent_tags" add constraint "agent_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."agent_tags" validate constraint "agent_tags_tag_id_fkey";

alter table "public"."tags" add constraint "tahs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."tags" validate constraint "tahs_workspace_id_fkey";

grant delete on table "public"."agent_tags" to "anon";

grant insert on table "public"."agent_tags" to "anon";

grant references on table "public"."agent_tags" to "anon";

grant select on table "public"."agent_tags" to "anon";

grant trigger on table "public"."agent_tags" to "anon";

grant truncate on table "public"."agent_tags" to "anon";

grant update on table "public"."agent_tags" to "anon";

grant delete on table "public"."agent_tags" to "authenticated";

grant insert on table "public"."agent_tags" to "authenticated";

grant references on table "public"."agent_tags" to "authenticated";

grant select on table "public"."agent_tags" to "authenticated";

grant trigger on table "public"."agent_tags" to "authenticated";

grant truncate on table "public"."agent_tags" to "authenticated";

grant update on table "public"."agent_tags" to "authenticated";

grant delete on table "public"."agent_tags" to "service_role";

grant insert on table "public"."agent_tags" to "service_role";

grant references on table "public"."agent_tags" to "service_role";

grant select on table "public"."agent_tags" to "service_role";

grant trigger on table "public"."agent_tags" to "service_role";

grant truncate on table "public"."agent_tags" to "service_role";

grant update on table "public"."agent_tags" to "service_role";

grant delete on table "public"."tags" to "anon";

grant insert on table "public"."tags" to "anon";

grant references on table "public"."tags" to "anon";

grant select on table "public"."tags" to "anon";

grant trigger on table "public"."tags" to "anon";

grant truncate on table "public"."tags" to "anon";

grant update on table "public"."tags" to "anon";

grant delete on table "public"."tags" to "authenticated";

grant insert on table "public"."tags" to "authenticated";

grant references on table "public"."tags" to "authenticated";

grant select on table "public"."tags" to "authenticated";

grant trigger on table "public"."tags" to "authenticated";

grant truncate on table "public"."tags" to "authenticated";

grant update on table "public"."tags" to "authenticated";

grant delete on table "public"."tags" to "service_role";

grant insert on table "public"."tags" to "service_role";

grant references on table "public"."tags" to "service_role";

grant select on table "public"."tags" to "service_role";

grant trigger on table "public"."tags" to "service_role";

grant truncate on table "public"."tags" to "service_role";

grant update on table "public"."tags" to "service_role";


  create policy "DELETE"
  on "public"."agent_tags"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.agents a
  WHERE ((a.id = agent_tags.agent_id) AND public.is_workspace_writer(a.workspace_id, ( SELECT auth.uid() AS uid))))));



  create policy "INSERT"
  on "public"."agent_tags"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.agents a
  WHERE ((a.id = agent_tags.agent_id) AND public.is_workspace_writer(a.workspace_id, ( SELECT auth.uid() AS uid))))));



  create policy "SELECT"
  on "public"."agent_tags"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.agents a
  WHERE ((a.id = agent_tags.agent_id) AND public.is_workspace_reader(a.workspace_id, ( SELECT auth.uid() AS uid))))));



  create policy "UPDATE"
  on "public"."agent_tags"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.agents a
  WHERE ((a.id = agent_tags.agent_id) AND public.is_workspace_writer(a.workspace_id, ( SELECT auth.uid() AS uid))))))
with check ((EXISTS ( SELECT 1
   FROM public.agents a
  WHERE ((a.id = agent_tags.agent_id) AND public.is_workspace_writer(a.workspace_id, ( SELECT auth.uid() AS uid))))));



  create policy "DELETE"
  on "public"."tags"
  as permissive
  for delete
  to authenticated
using (public.is_workspace_writer(workspace_id, ( SELECT auth.uid() AS uid)));



  create policy "INSERT"
  on "public"."tags"
  as permissive
  for insert
  to authenticated
with check (public.is_workspace_writer(workspace_id, ( SELECT auth.uid() AS uid)));



  create policy "SELECT"
  on "public"."tags"
  as permissive
  for select
  to authenticated
using (public.is_workspace_reader(workspace_id, ( SELECT auth.uid() AS uid)));



  create policy "UPDATE"
  on "public"."tags"
  as permissive
  for update
  to authenticated
using (public.is_workspace_writer(workspace_id, ( SELECT auth.uid() AS uid)))
with check (public.is_workspace_writer(workspace_id, ( SELECT auth.uid() AS uid)));



