import { queryOptions } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const workspacesQuery = queryOptions({
	queryKey: ["workspaces"],
	queryFn: async () => {
		const { data, error } = await supabase
			.from("workspaces")
			.select("*, workspace_user(*, users(*))");

		if (error) throw error;

		return data;
	},
});

export const providersQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["providers", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("providers")
				.select("id, name, type, created_at, updated_at")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const mcpsQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["mcps", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("mcps")
				.select("id, name, tools, created_at, updated_at")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const agentsQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["agents", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("agents")
				.select("*")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const agentQuery = (agentId: string) =>
	queryOptions({
		queryKey: ["agent", agentId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("agents")
				.select("*")
				.eq("id", agentId)
				.single();

			if (error) throw error;

			return data;
		},
		enabled: !!agentId,
	});

export const agentVersionsQuery = (agentId: string) =>
	queryOptions({
		queryKey: ["agent-versions", agentId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("versions")
				.select("*")
				.eq("agent_id", agentId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!agentId,
	});

export const apiKeysQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["api-keys", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("api_keys")
				.select("*")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const runsQuery = (
	workspaceId: string,
	page: number,
	dateRange?: { from: string; to: string },
) =>
	queryOptions({
		queryKey: ["runs", workspaceId, page, dateRange],
		queryFn: async () => {
			let query = supabase
				.from("runs")
				.select("id, is_error, is_test, created_at, versions(id, agents(name))")
				.eq("workspace_id", workspaceId);

			// Apply date filtering if provided
			if (dateRange) {
				query = query.gte("created_at", dateRange.from);
				query = query.lte("created_at", dateRange.to);
			}

			query = query
				.order("created_at", { ascending: false })
				.range((page - 1) * 20, page * 20);

			const { data, error } = await query;

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
		staleTime: 0,
	});

export const runQuery = (runId: string) =>
	queryOptions({
		queryKey: ["run", runId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("runs")
				.select("*, versions(id, agents(id, name))")
				.eq("id", runId)
				.single();

			if (error) throw error;

			return data;
		},
		enabled: !!runId,
	});

export const workspaceUserQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["workspace-user", workspaceId],
		queryFn: async () => {
			const { data: claimsData, error: claimsError } =
				await supabase.auth.getClaims();

			if (claimsError) throw claimsError;

			const claims = claimsData?.claims;

			if (!claims?.sub) throw new Error("User not found");

			const { data: user, error: userError } = await supabase
				.from("users")
				.select("*")
				.eq("id", claims.sub)
				.single();

			if (userError) throw userError;

			const { data: workspaceUser, error: workspaceUserError } = await supabase
				.from("workspace_user")
				.select("*")
				.eq("workspace_id", workspaceId)
				.eq("user_id", claims.sub)
				.single();

			if (workspaceUserError) throw workspaceUserError;

			return {
				id: user.id,
				name: user.name,
				email: claims.email,
				workspace_id: workspaceUser.workspace_id,
				role: workspaceUser.role,
			};
		},
		enabled: !!workspaceId,
	});
