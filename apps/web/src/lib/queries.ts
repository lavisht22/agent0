import type { Json, Tables } from "@repo/database";
import { queryOptions } from "@tanstack/react-query";
import {
	computeDateRangeFromPreset,
	type DateRangeValue,
} from "@/components/date-range-picker";
import { api } from "./api-client";
import { supabase } from "./supabase";
import type { RunData } from "./types";

// The runner's tags endpoints return this subset of the full row.
export type Tag = Pick<
	Tables<"tags">,
	"id" | "name" | "color" | "workspace_id"
>;

// The runner returns a flat per-membership view (the caller's role in each
// workspace), not the nested member roster the old direct query embedded.
// Member rosters now come from `membersQuery`.
export type Workspace = {
	id: string;
	name: string;
	role: "admin" | "writer" | "reader";
	created_at: string;
};

export type WorkspaceMember = {
	user_id: string;
	role: "admin" | "writer" | "reader";
	created_at: string;
	updated_at: string;
	user: { id: string; name: string | null } | null;
};

export const workspacesQuery = queryOptions({
	queryKey: ["workspaces"],
	queryFn: async () => {
		const { data } = await api.get<{ data: Workspace[] }>("/api/v1/workspaces");

		return data;
	},
});

export const membersQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["workspace-members", workspaceId],
		queryFn: async () => {
			const { data } = await api.get<{ data: WorkspaceMember[] }>(
				`/api/v1/workspaces/${workspaceId}/members`,
			);

			return data;
		},
		enabled: !!workspaceId,
	});

export async function createWorkspace(name: string) {
	const { data } = await api.post<{ data: Workspace }>("/api/v1/workspaces", {
		name,
	});

	return data;
}

export async function updateWorkspace(workspaceId: string, name: string) {
	const { data } = await api.patch<{ data: Workspace }>(
		`/api/v1/workspaces/${workspaceId}`,
		{ name },
	);

	return data;
}

export async function deleteWorkspace(workspaceId: string) {
	await api.delete(`/api/v1/workspaces/${workspaceId}`);
}

// Remove a member (admin) or leave the workspace (self).
export async function removeWorkspaceMember(
	workspaceId: string,
	userId: string,
) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/members/${userId}`);
}

// The runner derives `has_staging_config` from the encrypted blob and never
// returns the blobs themselves on the list/CRUD endpoints.
export type Provider = {
	id: string;
	name: string;
	type: string;
	has_staging_config: boolean;
	created_at: string;
	updated_at: string;
};

export const providersQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["providers", workspaceId],
		queryFn: async () => {
			const { data } = await api.get<{ data: Provider[] }>(
				`/api/v1/workspaces/${workspaceId}/providers`,
			);

			return data;
		},
		enabled: !!workspaceId,
	});

// Config blobs are PGP-encrypted in the browser; the API only ever sees the
// armored ciphertext. `encrypted_data_staging: null` clears the staging override.
export async function createProvider(
	workspaceId: string,
	input: {
		name: string;
		type: string;
		encrypted_data_production: string;
		encrypted_data_staging: string | null;
	},
) {
	const { data } = await api.post<{ data: Provider }>(
		`/api/v1/workspaces/${workspaceId}/providers`,
		input,
	);

	return data;
}

// Partial update: omit a field to leave it untouched. Pass
// `encrypted_data_staging: null` to clear the staging override. The runner
// stamps `updated_at`, so the caller never sends it.
export async function updateProvider(
	workspaceId: string,
	providerId: string,
	input: {
		name?: string;
		type?: string;
		encrypted_data_production?: string;
		encrypted_data_staging?: string | null;
	},
) {
	const { data } = await api.patch<{ data: Provider }>(
		`/api/v1/workspaces/${workspaceId}/providers/${providerId}`,
		input,
	);

	return data;
}

export async function deleteProvider(workspaceId: string, providerId: string) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/providers/${providerId}`);
}

// `tools` is populated by the refresh endpoint, never on create/update;
// `has_staging_config` is derived from the (never-returned) encrypted blob.
export type Mcp = {
	id: string;
	name: string;
	tools: Json | null;
	custom_headers: string;
	has_staging_config: boolean;
	created_at: string;
	updated_at: string;
};

export const mcpsQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["mcps", workspaceId],
		queryFn: async () => {
			const { data } = await api.get<{ data: Mcp[] }>(
				`/api/v1/workspaces/${workspaceId}/mcps`,
			);

			return data;
		},
		enabled: !!workspaceId,
	});

// Config blobs are PGP-encrypted in the browser; the API only sees ciphertext.
// `custom_headers` is a comma-separated header-name list (the runner trims it).
export async function createMcp(
	workspaceId: string,
	input: {
		name: string;
		encrypted_data_production: string;
		encrypted_data_staging: string | null;
		custom_headers: string;
	},
) {
	const { data } = await api.post<{ data: Mcp }>(
		`/api/v1/workspaces/${workspaceId}/mcps`,
		input,
	);

	return data;
}

// Partial update; omit a field to leave it untouched, pass
// `encrypted_data_staging: null` to clear the staging override. The runner
// stamps `updated_at`.
export async function updateMcp(
	workspaceId: string,
	mcpId: string,
	input: {
		name?: string;
		encrypted_data_production?: string;
		encrypted_data_staging?: string | null;
		custom_headers?: string;
	},
) {
	const { data } = await api.patch<{ data: Mcp }>(
		`/api/v1/workspaces/${workspaceId}/mcps/${mcpId}`,
		input,
	);

	return data;
}

export async function deleteMcp(workspaceId: string, mcpId: string) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/mcps/${mcpId}`);
}

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
			const { data } = await api.get<{ data: Tag[] }>(
				`/api/v1/workspaces/${workspaceId}/tags`,
			);

			return data;
		},
		enabled: !!workspaceId,
	});

export async function createTag(
	workspaceId: string,
	input: { name: string; color: string },
) {
	const { data } = await api.post<{ data: Tag }>(
		`/api/v1/workspaces/${workspaceId}/tags`,
		input,
	);

	return data;
}

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
				.select(
					"*, agent_tags(*, tags(*)), staging_version:agent_versions!staging_version_id(data), production_version:agent_versions!production_version_id(data)",
				)
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
				.from("agent_versions")
				.select("*")
				.eq("agent_id", agentId)
				.order("created_at", { ascending: false });

			if (error) throw error;

			return data;
		},
		enabled: !!agentId,
	});

// API keys are an admin-only resource; the row holds the plaintext `key` (only
// shown once on create, redacted thereafter in the list).
export type ApiKey = {
	id: string;
	key: string;
	name: string;
	scopes: string[];
	allowed_origins: string[] | null;
	user_id: string;
	workspace_id: string;
	created_at: string;
};

export const apiKeysQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["api-keys", workspaceId],
		queryFn: async () => {
			const { data } = await api.get<{ data: ApiKey[] }>(
				`/api/v1/workspaces/${workspaceId}/api-keys`,
			);

			return data;
		},
		enabled: !!workspaceId,
	});

// The runner mints the key server-side and sets the owner from the caller; an
// empty `allowed_origins` is normalized to null ("any origin"). The returned row
// carries the plaintext `key` for the one-time reveal.
export async function createApiKey(
	workspaceId: string,
	input: { name: string; scopes: string[]; allowed_origins: string[] },
) {
	const { data } = await api.post<{ data: ApiKey }>(
		`/api/v1/workspaces/${workspaceId}/api-keys`,
		input,
	);

	return data;
}

// key/owner/workspace are immutable; only name/scopes/origins are editable.
export async function updateApiKey(
	workspaceId: string,
	apiKeyId: string,
	input: { name?: string; scopes?: string[]; allowed_origins?: string[] },
) {
	const { data } = await api.patch<{ data: ApiKey }>(
		`/api/v1/workspaces/${workspaceId}/api-keys/${apiKeyId}`,
		input,
	);

	return data;
}

export async function deleteApiKey(workspaceId: string, apiKeyId: string) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/api-keys/${apiKeyId}`);
}

// PATs are user-bound, not workspace-bound — the runner scopes every op to the
// caller's own tokens, so these paths carry no workspaceId.
export type PersonalAccessToken = {
	id: string;
	name: string;
	token_prefix: string;
	created_at: string;
	last_used_at: string | null;
	expires_at: string | null;
	revoked_at: string | null;
};

export const personalAccessTokensQuery = queryOptions({
	queryKey: ["personal-access-tokens"],
	queryFn: async () => {
		const { data } = await api.get<{ data: PersonalAccessToken[] }>(
			"/api/v1/personal-access-tokens",
		);

		return data;
	},
});

// The runner mints the token (hash + prefix persisted server-side) and returns
// the raw secret exactly once, alongside the new row's metadata.
export async function createPersonalAccessToken(name: string) {
	const { data } = await api.post<{
		data: PersonalAccessToken & { token: string };
	}>("/api/v1/personal-access-tokens", { name });

	return data;
}

// Soft delete (sets revoked_at) scoped to the caller's own tokens.
export async function revokePersonalAccessToken(tokenId: string) {
	await api.delete(`/api/v1/personal-access-tokens/${tokenId}`);
}

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
			// Inner join only when filtering by a specific agent (untagged runs
			// don't belong to any agent). Otherwise left join so runs from unsaved
			// agents (null version_id) still appear in the list.
			let query = supabase
				.from("runs")
				.select(
					agentId
						? "*, agent_versions!inner(id, agent_id, agents:agent_id(name))"
						: "*, agent_versions(id, agent_id, agents:agent_id(name))",
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
				query = query.eq("agent_versions.agent_id", agentId);
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
				.select("*, agent_versions(id, agents:agent_id(id, name))")
				.eq("id", runId)
				.single()
				.throwOnError();

			return data;
		},
		enabled: !!runId,
	});

// Runs invoked by this run via an agent-as-tool (parent_run_id == runId).
export const childRunsQuery = (parentRunId: string | null | undefined) =>
	queryOptions({
		queryKey: ["child-runs", parentRunId],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("runs")
				.select(
					"id, is_error, is_test, created_at, agent_versions(id, agents:agent_id(name))",
				)
				.eq("parent_run_id", parentRunId as string)
				.order("created_at", { ascending: true });

			if (error) throw error;

			return data;
		},
		enabled: !!parentRunId,
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
			// Identity (id + email) comes from the Supabase session — auth stays on
			// Supabase until Phase 2. Role + display name come from the members API.
			const { data: claimsData, error: claimsError } =
				await supabase.auth.getClaims();

			if (claimsError) throw claimsError;

			const claims = claimsData?.claims;

			if (!claims?.sub) throw new Error("User not found");

			const { data: members } = await api.get<{ data: WorkspaceMember[] }>(
				`/api/v1/workspaces/${workspaceId}/members`,
			);

			const me = members.find((m) => m.user_id === claims.sub);

			if (!me) throw new Error("User not found");

			return {
				id: claims.sub,
				name: me.user?.name ?? null,
				email: claims.email,
				workspace_id: workspaceId,
				role: me.role,
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
			// Left join so runs from unsaved agents (null version_id) still appear.
			const { data, error } = await supabase
				.from("runs")
				.select("*, agent_versions(id, agent_id, agents:agent_id(name))")
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
