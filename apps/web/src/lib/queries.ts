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

export const tagsQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["tags", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("tags")
				.select("*")
				.eq("workspace_id", workspaceId)
				.order("name", { ascending: true });

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const agentTagsQuery = (agentId: string) =>
	queryOptions({
		queryKey: ["agent-tags", agentId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("agent_tags")
				.select("*, tags(*)")
				.eq("agent_id", agentId);

			if (error) throw error;

			return data;
		},
		enabled: !!agentId && agentId !== "new",
	});

export const agentsQuery = (
	workspaceId: string,
	page = 1,
	search?: string,
	tagIds?: string[],
) =>
	queryOptions({
		queryKey: ["agents", workspaceId, page, search, tagIds],
		queryFn: async () => {
			// First, get agent IDs that match the tag filter (if provided)
			let matchingAgentIds: string[] | null = null;

			if (tagIds && tagIds.length > 0) {
				const { data: agentTags, error: tagError } = await supabase
					.from("agent_tags")
					.select("agent_id")
					.in("tag_id", tagIds);

				if (tagError) throw tagError;

				// Get unique agent IDs that have ALL selected tags
				const agentIdCounts = agentTags.reduce(
					(acc, { agent_id }) => {
						acc[agent_id] = (acc[agent_id] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>,
				);

				// Only include agents that have all selected tags
				matchingAgentIds = Object.entries(agentIdCounts)
					.filter(([_, count]) => count >= tagIds.length)
					.map(([id]) => id);

				// If no agents match the tags, return empty array
				if (matchingAgentIds.length === 0) {
					return [];
				}
			}

			let query = supabase
				.from("agents")
				.select("*, agent_tags(*, tags(*))")
				.eq("workspace_id", workspaceId);

			// Apply agent ID filter if we have matching agents from tags
			if (matchingAgentIds) {
				query = query.in("id", matchingAgentIds);
			}

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
				.select("*, versions!inner(id, agent_id, agents:agent_id(name))")
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
				.select("*, versions(id, agents:agent_id(id, name))")
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

export const dashboardStatsQuery = (
	workspaceId: string,
	dateFilter: DateRangeValue,
) =>
	queryOptions({
		queryKey: [
			"dashboard-stats",
			workspaceId,
			dateFilter.datePreset
				? { preset: dateFilter.datePreset }
				: { from: dateFilter.startDate, to: dateFilter.endDate },
		],
		queryFn: async () => {
			// Compute date range
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			// Use RPC function to calculate stats at database level (avoids 1000 row limit)
			const { data, error } = await supabase.rpc("get_dashboard_stats", {
				p_workspace_id: workspaceId,
				p_start_date: dateRange?.from,
				p_end_date: dateRange?.to,
			});

			if (error) throw error;

			// Parse the response - RPC returns json object
			const stats = data as {
				total_runs: number;
				successful_runs: number;
				failed_runs: number;
				success_rate: number;
				total_cost: number;
				total_tokens: number;
				avg_response_time: number;
			};

			return {
				totalRuns: stats.total_runs,
				successfulRuns: stats.successful_runs,
				failedRuns: stats.failed_runs,
				successRate: stats.success_rate,
				totalCost: stats.total_cost,
				totalTokens: stats.total_tokens,
				avgResponseTime: stats.avg_response_time,
			};
		},
		enabled: !!workspaceId,
	});

export const recentRunsQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["recent-runs", workspaceId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("runs")
				.select("*, versions!inner(id, agent_id, agents:agent_id(name))")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false })
				.limit(5);

			if (error) throw error;

			return data;
		},
		enabled: !!workspaceId,
	});

export const topAgentsQuery = (
	workspaceId: string,
	dateFilter: DateRangeValue,
) =>
	queryOptions({
		queryKey: [
			"top-agents",
			workspaceId,
			dateFilter.datePreset
				? { preset: dateFilter.datePreset }
				: { from: dateFilter.startDate, to: dateFilter.endDate },
		],
		queryFn: async () => {
			// Compute date range
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			// Use RPC function to aggregate at database level (avoids 1000 row limit)
			const { data, error } = await supabase.rpc("get_top_agents", {
				p_workspace_id: workspaceId,
				p_start_date: dateRange?.from,
				p_end_date: dateRange?.to,
				p_limit: 5,
			});

			if (error) throw error;

			// Parse the response - RPC returns json array
			const agents = data as Array<{
				id: string;
				name: string;
				runs: number;
				errors: number;
				cost: number;
			}>;

			return agents;
		},
		enabled: !!workspaceId,
	});