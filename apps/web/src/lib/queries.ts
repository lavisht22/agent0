import { queryOptions } from "@tanstack/react-query";
import {
	computeDateRangeFromPreset,
	type DateRangeValue,
} from "@/components/date-range-picker";
import { supabase } from "./supabase";
import type { RunData } from "./types";

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

export const agentsLiteQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["agents-lite"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("agents")
				.select("id, name")
				.eq("workspace_id", workspaceId);

			if (error) throw error;

			return data;
		},
	});

export const agentsQuery = (workspaceId: string, page = 1, search?: string) =>
	queryOptions({
		queryKey: ["agents", workspaceId, page, search],
		queryFn: async () => {
			let query = supabase
				.from("agents")
				.select("*")
				.eq("workspace_id", workspaceId);

			// Apply search filter if provided
			if (search) {
				query = query.ilike("name", `%${search}%`);
			}

			query = query
				.order("created_at", { ascending: false })
				.range((page - 1) * 20, page * 20);

			const { data, error } = await query;

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
	dateFilter: DateRangeValue,
	agentId?: string,
	status?: "success" | "failed",
) =>
	queryOptions({
		// Use preset key or custom dates in the query key for stability
		// When using a preset, the key stays stable even if time passes
		queryKey: [
			"runs",
			workspaceId,
			page,
			dateFilter.datePreset
				? { preset: dateFilter.datePreset }
				: { from: dateFilter.startDate, to: dateFilter.endDate },
			agentId,
			status,
		],
		queryFn: async () => {
			let query = supabase
				.from("runs")
				.select(
					"id, is_error, is_test, pre_processing_time, first_token_time, response_time, created_at, versions!inner(id, agent_id, agents(name))",
				)
				.eq("workspace_id", workspaceId);

			// Compute date range at query time
			// For presets, this ensures we always query with fresh dates
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			// Apply date filtering if computed
			if (dateRange) {
				query = query.gte("created_at", dateRange.from);
				query = query.lte("created_at", dateRange.to);
			}

			// Apply agent filtering if provided
			if (agentId) {
				query = query.eq("versions.agent_id", agentId);
			}

			// Apply status filtering if provided
			if (status === "success") {
				query = query.eq("is_error", false);
			} else if (status === "failed") {
				query = query.eq("is_error", true);
			}

			query = query
				.order("created_at", { ascending: false })
				.range((page - 1) * 20, page * 20);

			const { data, error } = await query;

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const runQuery = (runId: string) =>
	queryOptions({
		queryKey: ["run", runId],
		queryFn: async () => {
			const { data } = await supabase
				.from("runs")
				.select("*, versions(id, agents(id, name))")
				.eq("id", runId)
				.single()
				.throwOnError();

			return data;
		},
		enabled: !!runId,
	});

export const runDataQuery = (runId: string) =>
	queryOptions({
		queryKey: ["run-data", runId],
		queryFn: async () => {
			const { data: runData, error: runDataError } = await supabase.storage
				.from("runs-data")
				.download(`${runId}`);

			if (runDataError) throw runDataError;

			// Convert blob into string and parse as JSON
			const runDataString = await runData.text();
			const data = JSON.parse(runDataString) as RunData;

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
