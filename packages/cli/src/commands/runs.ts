import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface AgentRef {
	id: string;
	name: string;
}

interface RunSummary {
	id: string;
	version_id: string;
	is_error: boolean;
	is_test: boolean;
	is_stream: boolean;
	cost: number | null;
	tokens: number | null;
	response_time: number | null;
	first_token_time: number | null;
	pre_processing_time: number | null;
	created_at: string;
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
	if (opts.status !== undefined && opts.status !== "success" && opts.status !== "failed") {
		fail(`--status must be "success" or "failed" (got "${opts.status}").`);
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const query: Record<string, string> = {};
	if (opts.agent) query.agent_id = opts.agent;
	if (opts.status) query.status = opts.status;
	if (opts.from) query.start_date = opts.from;
	if (opts.to) query.end_date = opts.to;
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
		const status = r.is_error ? "failed" : "success";
		const agentName = r.agent?.name ?? "(deleted)";
		console.log(
			`${r.id}  ${r.created_at}  ${status}  ${agentName}  ${formatCost(r.cost)}`,
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
