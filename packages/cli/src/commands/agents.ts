import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";
import { normalizeStringArray, resolveTagNames } from "../lib/tags.js";

interface AgentTag {
	id: string;
	name: string;
}

interface Agent {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
	tags: AgentTag[];
	created_at: string;
	updated_at: string;
}

interface AgentListResponse {
	data: Agent[];
	page: number;
	limit: number;
}

interface AgentResponse {
	data: Agent;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

interface ListOpts extends CommonOpts {
	search?: string;
	tag?: string | string[];
	page?: string | number;
	limit?: string | number;
}

interface CreateOpts extends CommonOpts {
	name?: string;
	tag?: string | string[];
}

interface RenameOpts extends CommonOpts {
	name?: string;
}

function shortId(id: string | null): string {
	if (!id) return "-";
	return id.slice(0, 8);
}

function renderAgentLine(agent: Agent): string {
	const tagNames =
		agent.tags && agent.tags.length > 0
			? agent.tags.map((t) => t.name).join(",")
			: "-";
	return `${agent.id}  ${agent.name}  [${tagNames}]  staging:${shortId(agent.staging_version_id)} prod:${shortId(agent.production_version_id)}`;
}

function renderAgentDetail(agent: Agent): string {
	const tagsLine =
		agent.tags && agent.tags.length > 0
			? agent.tags.map((t) => `${t.name} (${t.id})`).join(", ")
			: "(none)";
	return [
		`id:          ${agent.id}`,
		`name:        ${agent.name}`,
		`staging:     ${agent.staging_version_id ?? "(not deployed)"}`,
		`production:  ${agent.production_version_id ?? "(not deployed)"}`,
		`tags:        ${tagsLine}`,
		`created_at:  ${agent.created_at}`,
		`updated_at:  ${agent.updated_at}`,
	].join("\n");
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

export async function agentsListCommand(opts: ListOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const tagNames = normalizeStringArray(opts.tag);
	const tagIds =
		tagNames.length > 0 ? await resolveTagNames(client, tagNames) : [];

	const query: Record<string, string> = {};
	if (opts.search) query.search = opts.search;
	if (tagIds.length > 0) query.tag_ids = tagIds.join(",");
	if (opts.page !== undefined) query.page = String(opts.page);
	if (opts.limit !== undefined) query.limit = String(opts.limit);

	let res: AgentListResponse;
	try {
		res = await client.ws<AgentListResponse>("/agents", { query });
	} catch (err) {
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no agents)");
		return;
	}

	for (const agent of res.data) {
		console.log(renderAgentLine(agent));
	}
}

export async function agentsGetCommand(
	agentId: string,
	opts: CommonOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: AgentResponse;
	try {
		res = await client.ws<AgentResponse>(`/agents/${agentId}`);
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Agent "${agentId}" not found in workspace "${profile.workspace_id}".`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	console.log(renderAgentDetail(res.data));
}

export async function agentsCreateCommand(opts: CreateOpts): Promise<void> {
	if (!opts.name || opts.name.trim().length === 0) {
		fail("--name is required (use `--name \"My agent\"`).");
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const tagNames = normalizeStringArray(opts.tag);
	const tagIds =
		tagNames.length > 0 ? await resolveTagNames(client, tagNames) : [];

	const body: { name: string; tag_ids?: string[] } = { name: opts.name.trim() };
	if (tagIds.length > 0) body.tag_ids = tagIds;

	let res: AgentResponse;
	try {
		res = await client.ws<AgentResponse>("/agents", {
			method: "POST",
			body,
		});
	} catch (err) {
		if (getStatus(err) === 403) {
			fail("Creating agents requires a personal access token (API keys can't write).");
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	console.log(`Created agent ${res.data.id}`);
	console.log(renderAgentDetail(res.data));
	console.log("");
	console.log(
		`Push a first prompt version with: agent0 prompt push ${res.data.id} -f prompt.json`,
	);
}

export async function agentsRenameCommand(
	agentId: string,
	opts: RenameOpts,
): Promise<void> {
	if (!opts.name || opts.name.trim().length === 0) {
		fail("--name is required (use `--name \"New name\"`).");
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: AgentResponse;
	try {
		res = await client.ws<AgentResponse>(`/agents/${agentId}`, {
			method: "PATCH",
			body: { name: opts.name.trim() },
		});
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail("Renaming agents requires a personal access token (API keys can't write).");
		}
		if (status === 404) {
			fail(`Agent "${agentId}" not found in workspace "${profile.workspace_id}".`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	console.log(`Renamed agent ${res.data.id} to "${res.data.name}".`);
}
