import { type ResolveOpts, requireProfile } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { buildMetadata } from "../lib/meta.js";
import { printJson } from "../lib/output.js";

interface AgentRef {
	id: string;
	name: string;
}

interface RunSummary {
	id: string;
	version_id: string;
	parent_run_id: string | null;
	status: "success" | "error" | "aborted";
	is_test: boolean;
	is_stream: boolean;
	cost: number | null;
	tokens: number | null;
	response_time: number | null;
	first_token_time: number | null;
	pre_processing_time: number | null;
	created_at: string;
	metadata: Record<string, string> | null;
	agent: AgentRef | null;
}

interface RunsListResponse {
	data: RunSummary[];
	page: number;
	limit: number;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

export interface RunsListOpts extends CommonOpts {
	agent?: string;
	status?: string;
	from?: string;
	to?: string;
	meta?: string | string[];
	page?: string | number;
	limit?: string | number;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

function formatCost(cost: number | null): string {
	if (cost === null || cost === undefined) return "-";
	return `$${cost.toFixed(4)}`;
}

export async function runsListCommand(opts: RunsListOpts): Promise<void> {
	if (
		opts.status !== undefined &&
		opts.status !== "success" &&
		opts.status !== "failed" &&
		opts.status !== "aborted"
	) {
		fail(
			`--status must be "success", "failed", or "aborted" (got "${opts.status}").`,
		);
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const metadataFilter = buildMetadata(opts.meta);

	const query: Record<string, string> = {};
	if (opts.agent) query.agent_id = opts.agent;
	if (opts.status) query.status = opts.status;
	if (opts.from) query.start_date = opts.from;
	if (opts.to) query.end_date = opts.to;
	// The list endpoint takes metadata as a JSON object of pairs to match.
	if (metadataFilter) query.metadata = JSON.stringify(metadataFilter);
	if (opts.page !== undefined) query.page = String(opts.page);
	if (opts.limit !== undefined) query.limit = String(opts.limit);

	let res: RunsListResponse;
	try {
		res = await client.ws<RunsListResponse>("/runs", { query });
	} catch (err) {
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no runs)");
		return;
	}

	for (const r of res.data) {
		// Map the stored `error` status to the CLI's "failed" label; success and
		// aborted pass through unchanged.
		const status = r.status === "error" ? "failed" : r.status;
		const agentName = r.agent?.name ?? "(deleted)";
		// Mark sub-runs (invoked by another agent via agent-as-tool) with their
		// parent run id, so it can be inspected with `runs get <parentId>`.
		const lineage = r.parent_run_id ? `  ↳ child of ${r.parent_run_id}` : "";
		const meta =
			r.metadata && Object.keys(r.metadata).length > 0
				? `  {${Object.entries(r.metadata)
						.map(([k, v]) => `${k}=${v}`)
						.join(", ")}}`
				: "";
		console.log(
			`${r.id}  ${r.created_at}  ${status}  ${agentName}  ${formatCost(r.cost)}${meta}${lineage}`,
		);
	}
}

export async function runsGetCommand(
	runId: string,
	opts: CommonOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: Record<string, unknown> };
	try {
		res = await client.ws<{ data: Record<string, unknown> }>(`/runs/${runId}`);
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Run "${runId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}

	printJson(res, { json: opts.json });
}
