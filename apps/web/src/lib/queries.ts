import type { Json, tags } from "@repo/database";
import { queryOptions } from "@tanstack/react-query";
import {
	computeDateRangeFromPreset,
	type DateRangeValue,
} from "@/components/date-range-picker";
import { api } from "./api-client";
import { getCachedSession } from "./auth-client";
import type { RunData } from "./types";

export type Tag = Pick<
	typeof tags.$inferSelect,
	"id" | "name" | "color" | "workspace_id"
>;

// Flat per-membership view (the caller's role in each workspace); member
// rosters come from `membersQuery`.
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

export async function removeWorkspaceMember(
	workspaceId: string,
	userId: string,
) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/members/${userId}`);
}

// `has_staging_config` is derived server-side; the encrypted blobs are never returned.
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

// `data_staging: null` clears the staging override.
export async function createProvider(
	workspaceId: string,
	input: {
		name: string;
		type: string;
		data_production: string;
		data_staging: string | null;
	},
) {
	const { data } = await api.post<{ data: Provider }>(
		`/api/v1/workspaces/${workspaceId}/providers`,
		input,
	);

	return data;
}

// Omit a field to leave it untouched; `data_staging: null` clears the override.
export async function updateProvider(
	workspaceId: string,
	providerId: string,
	input: {
		name?: string;
		type?: string;
		data_production?: string;
		data_staging?: string | null;
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

// `tools` is populated by the refresh endpoint, never on create/update.
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

// `custom_headers` is a comma-separated header-name list.
export async function createMcp(
	workspaceId: string,
	input: {
		name: string;
		data_production: string;
		data_staging: string | null;
		custom_headers: string;
	},
) {
	const { data } = await api.post<{ data: Mcp }>(
		`/api/v1/workspaces/${workspaceId}/mcps`,
		input,
	);

	return data;
}

// Omit a field to leave it untouched; `data_staging: null` clears the override.
export async function updateMcp(
	workspaceId: string,
	mcpId: string,
	input: {
		name?: string;
		data_production?: string;
		data_staging?: string | null;
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

// Connects to the MCP server(s) and re-reads their tool lists into `tools`.
export async function refreshMcp(workspaceId: string, mcpId: string) {
	const { tools } = await api.post<{
		tools: Json;
		errors?: { env: string; message: string }[];
	}>(`/api/v1/workspaces/${workspaceId}/mcps/${mcpId}/refresh`);

	return tools;
}

// Model summaries are derived server-side; the list omits the full prompt blob.
export type Agent = {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
	staging_model: { provider_id: string; name: string } | null;
	production_model: { provider_id: string; name: string } | null;
	tags: { id: string; name: string; color: string }[];
	created_at: string;
	updated_at: string;
};

export type AgentVersionSummary = {
	id: string;
	agent_id: string;
	is_deployed: boolean;
	user_id: string | null;
	created_at: string;
};

export type AgentVersionDetail = AgentVersionSummary & { data: Json };

export const agentsLiteQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["agents-lite", workspaceId],
		queryFn: async () => {
			// Pickers want the whole list; the runner caps at 100/page.
			const { data } = await api.get<{ data: Agent[] }>(
				`/api/v1/workspaces/${workspaceId}/agents`,
				{ query: { limit: 100 } },
			);

			return data.map((a) => ({ id: a.id, name: a.name }));
		},
		enabled: !!workspaceId,
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

export const agentsQuery = (
	workspaceId: string,
	page = 1,
	search?: string,
	tagIds?: string[],
) =>
	queryOptions({
		queryKey: ["agents", workspaceId, page, search, tagIds],
		queryFn: async () => {
			const { data } = await api.get<{ data: Agent[] }>(
				`/api/v1/workspaces/${workspaceId}/agents`,
				{
					query: {
						page,
						limit: 20,
						search,
						tag_ids: tagIds && tagIds.length > 0 ? tagIds.join(",") : undefined,
					},
				},
			);

			return data;
		},
		enabled: !!workspaceId,
	});

export const agentQuery = (workspaceId: string, agentId: string) =>
	queryOptions({
		queryKey: ["agent", agentId],
		queryFn: async () => {
			const { data } = await api.get<{ data: Agent }>(
				`/api/v1/workspaces/${workspaceId}/agents/${agentId}`,
			);

			return data;
		},
		enabled: !!agentId,
	});

export const agentVersionsQuery = (workspaceId: string, agentId: string) =>
	queryOptions({
		queryKey: ["agent-versions", agentId],
		queryFn: async () => {
			const { data } = await api.get<{ data: AgentVersionSummary[] }>(
				`/api/v1/workspaces/${workspaceId}/agents/${agentId}/versions`,
				{ query: { limit: 100 } },
			);

			return data;
		},
		enabled: !!agentId,
	});

// Single version with its full prompt `data` (the versions list omits data).
export const agentVersionQuery = (
	workspaceId: string,
	agentId: string,
	versionId: string | undefined,
) =>
	queryOptions({
		queryKey: ["agent-version", versionId],
		queryFn: async () => {
			const { data } = await api.get<{ data: AgentVersionDetail }>(
				`/api/v1/workspaces/${workspaceId}/agents/${agentId}/versions/${versionId}`,
			);

			return data;
		},
		enabled: !!workspaceId && !!agentId && !!versionId,
	});

export async function createAgent(workspaceId: string, name: string) {
	const { data } = await api.post<{ data: Agent }>(
		`/api/v1/workspaces/${workspaceId}/agents`,
		{ name },
	);

	return data;
}

export async function deleteAgent(workspaceId: string, agentId: string) {
	await api.delete(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`);
}

// Omit a field to leave it untouched; `tag_ids` replaces the full set.
export async function updateAgent(
	workspaceId: string,
	agentId: string,
	input: {
		name?: string;
		staging_version_id?: string | null;
		production_version_id?: string | null;
		tag_ids?: string[];
	},
) {
	const { data } = await api.patch<{ data: Agent }>(
		`/api/v1/workspaces/${workspaceId}/agents/${agentId}`,
		input,
	);

	return data;
}

export async function createAgentVersion(
	workspaceId: string,
	agentId: string,
	data: Json,
	deploy?: "staging" | "production",
) {
	const { data: version } = await api.post<{ data: AgentVersionDetail }>(
		`/api/v1/workspaces/${workspaceId}/agents/${agentId}/versions`,
		{ data },
		{ query: { deploy } },
	);

	return version;
}

// Admin-only; the plaintext `key` is shown once on create, redacted in the list.
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

// Empty `allowed_origins` is normalized to null ("any origin"). The returned row
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

// PATs are user-bound, not workspace-bound, so these paths carry no workspaceId.
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

// The raw secret is returned exactly once, alongside the new row's metadata.
export async function createPersonalAccessToken(name: string) {
	const { data } = await api.post<{
		data: PersonalAccessToken & { token: string };
	}>("/api/v1/personal-access-tokens", { name });

	return data;
}

export async function revokePersonalAccessToken(tokenId: string) {
	await api.delete(`/api/v1/personal-access-tokens/${tokenId}`);
}

// The detail endpoint inlines the run-log blob as `run_data`.
export type RunListItem = {
	id: string;
	version_id: string | null;
	parent_run_id: string | null;
	is_error: boolean;
	is_test: boolean;
	is_stream: boolean | null;
	cost: number | null;
	tokens: number | null;
	response_time: number;
	first_token_time: number;
	pre_processing_time: number;
	created_at: string;
	agent: { id: string; name: string | null } | null;
};

export type RunDetail = RunListItem & {
	workspace_id: string;
	run_data: RunData | null;
};

export const runsQuery = (
	workspaceId: string,
	page: number,
	dateFilter: DateRangeValue,
	agentId?: string,
	status?: "success" | "failed",
) =>
	queryOptions({
		// Keying on the preset (not resolved dates) keeps the key stable as time passes.
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
			// Resolve presets at query time so they always use fresh dates.
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			const { data } = await api.get<{ data: RunListItem[] }>(
				`/api/v1/workspaces/${workspaceId}/runs`,
				{
					query: {
						page,
						limit: 20,
						agent_id: agentId,
						status,
						start_date: dateRange?.from,
						end_date: dateRange?.to,
					},
				},
			);

			return data;
		},
		enabled: !!workspaceId,
	});

export const runQuery = (workspaceId: string, runId: string) =>
	queryOptions({
		queryKey: ["run", runId],
		queryFn: async () => {
			const { data } = await api.get<{ data: RunDetail }>(
				`/api/v1/workspaces/${workspaceId}/runs/${runId}`,
			);

			return data;
		},
		enabled: !!runId,
	});

// Runs invoked by this run via an agent-as-tool (parent_run_id == runId).
export const childRunsQuery = (
	workspaceId: string,
	parentRunId: string | null | undefined,
) =>
	queryOptions({
		queryKey: ["child-runs", parentRunId],
		queryFn: async () => {
			const { data } = await api.get<{ data: RunListItem[] }>(
				`/api/v1/workspaces/${workspaceId}/runs`,
				{ query: { parent_run_id: parentRunId } },
			);

			// Runner returns newest-first; sub-runs read better in call order.
			return [...data].reverse();
		},
		enabled: !!workspaceId && !!parentRunId,
	});

export const workspaceUserQuery = (workspaceId: string) =>
	queryOptions({
		queryKey: ["workspace-user", workspaceId],
		queryFn: async () => {
			// Identity comes from the session; role + display name from the members API.
			const session = await getCachedSession();

			if (!session?.user?.id) throw new Error("User not found");

			const { data: members } = await api.get<{ data: WorkspaceMember[] }>(
				`/api/v1/workspaces/${workspaceId}/members`,
			);

			const me = members.find((m) => m.user_id === session.user.id);

			if (!me) throw new Error("User not found");

			return {
				id: session.user.id,
				name: me.user?.name ?? null,
				email: session.user.email,
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
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			const { data: stats } = await api.get<{
				data: {
					total_runs: number;
					successful_runs: number;
					failed_runs: number;
					success_rate: number;
					total_cost: number;
					total_tokens: number;
					avg_response_time: number;
				};
			}>(`/api/v1/workspaces/${workspaceId}/dashboard/stats`, {
				query: { start_date: dateRange?.from, end_date: dateRange?.to },
			});

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
			const { data } = await api.get<{ data: RunListItem[] }>(
				`/api/v1/workspaces/${workspaceId}/runs`,
				{ query: { page: 1, limit: 5 } },
			);

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
			let dateRange: { from: string; to: string } | null = null;
			if (dateFilter.datePreset) {
				dateRange = computeDateRangeFromPreset(dateFilter.datePreset);
			} else if (dateFilter.startDate && dateFilter.endDate) {
				dateRange = { from: dateFilter.startDate, to: dateFilter.endDate };
			}

			const { data } = await api.get<{
				data: Array<{
					id: string;
					name: string;
					runs: number;
					errors: number;
					cost: number;
				}>;
			}>(`/api/v1/workspaces/${workspaceId}/dashboard/top-agents`, {
				query: {
					start_date: dateRange?.from,
					end_date: dateRange?.to,
					limit: 5,
				},
			});

			return data;
		},
		enabled: !!workspaceId,
	});
