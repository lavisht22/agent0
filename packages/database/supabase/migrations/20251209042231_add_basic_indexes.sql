CREATE INDEX agents_workspace_id_idx ON public.agents USING btree (workspace_id);

CREATE INDEX api_keys_workspace_id_idx ON public.api_keys USING btree (workspace_id);

CREATE INDEX mcps_workspace_id_idx ON public.mcps USING btree (workspace_id);

CREATE INDEX providers_workspace_id_idx ON public.providers USING btree (workspace_id);

CREATE INDEX runs_workspace_id_idx ON public.runs USING btree (workspace_id);

CREATE INDEX versions_agent_id_idx ON public.versions USING btree (agent_id);

CREATE INDEX versions_agent_id_is_deployed_idx ON public.versions USING btree (agent_id) WHERE (is_deployed IS TRUE);

CREATE INDEX workspace_user_user_id_idx ON public.workspace_user USING btree (user_id);

CREATE INDEX workspace_user_workspace_id_idx ON public.workspace_user USING btree (workspace_id);


