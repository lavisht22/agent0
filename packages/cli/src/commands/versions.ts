import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface VersionSummary {
	id: string;
	agent_id: string;
	is_deployed: boolean;
	user_id: string;
	created_at: string;
}

interface VersionDetail extends VersionSummary {
	data: Record<string, unknown>;
}

interface ListResponse {
	data: VersionSummary[];
	page: number;
	limit: number;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

export interface VersionsListOpts extends CommonOpts {
	page?: string | number;
	limit?: string | number;
}

export interface VersionsDeployOpts extends CommonOpts {
	env?: string;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function parseEnv(value: string | undefined): "staging" | "production" {
	if (value !== "staging" && value !== "production") {
		fail(`--env must be "staging" or "production" (got "${value ?? ""}").`);
	}
	return value;
}

export async function versionsListCommand(
	agentId: string,
	opts: VersionsListOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const query: Record<string, string> = {};
	if (opts.page !== undefined) query.page = String(opts.page);
	if (opts.limit !== undefined) query.limit = String(opts.limit);

	let res: ListResponse;
	try {
		res = await client.ws<ListResponse>(`/agents/${agentId}/versions`, {
			query,
		});
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Agent "${agentId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no versions)");
		return;
	}

	for (const v of res.data) {
		const deployed = v.is_deployed ? "deployed" : "draft";
		console.log(
			`${v.id}  ${v.created_at}  ${deployed}  by:${shortId(v.user_id)}`,
		);
	}
}

export async function versionsGetCommand(
	agentId: string,
	versionId: string,
	opts: CommonOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: VersionDetail };
	try {
		res = await client.ws<{ data: VersionDetail }>(
			`/agents/${agentId}/versions/${versionId}`,
		);
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Version "${versionId}" not found on agent "${agentId}".`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	const v = res.data;
	const dataBytes = Buffer.byteLength(JSON.stringify(v.data), "utf8");
	console.log(`id:           ${v.id}`);
	console.log(`agent_id:     ${v.agent_id}`);
	console.log(`created_at:   ${v.created_at}`);
	console.log(`is_deployed:  ${v.is_deployed}`);
	console.log(`user_id:      ${v.user_id}`);
	console.log(`data:         (JSON, ${dataBytes} bytes)`);
	console.log("");
	console.log(
		`Pull editable prompt with: agent0 prompt pull ${agentId} --version-id ${v.id} -o prompt.json`,
	);
}

interface Agent {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
}

export async function versionsDeployCommand(
	agentId: string,
	versionId: string,
	opts: VersionsDeployOpts,
): Promise<void> {
	const env = parseEnv(opts.env);

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const body =
		env === "staging"
			? { staging_version_id: versionId }
			: { production_version_id: versionId };

	let res: { data: Agent };
	try {
		res = await client.ws<{ data: Agent }>(`/agents/${agentId}`, {
			method: "PATCH",
			body,
		});
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail(
				"Deploying versions requires a personal access token (API keys can't write).",
			);
		}
		if (status === 404) {
			fail(`Agent "${agentId}" not found.`);
		}
		if (status === 400) {
			fail(extractErrorMessage(err));
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	console.log(`Deployed version ${versionId} to ${env} on agent ${agentId}.`);
}
