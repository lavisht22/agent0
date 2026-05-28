import { readFile, writeFile } from "node:fs/promises";
import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { type ApiClient, createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

type Env = "staging" | "production";

interface Agent {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
}

interface Version {
	id: string;
	agent_id: string;
	is_deployed: boolean;
	user_id: string;
	data: Record<string, unknown>;
	created_at: string;
}

interface VersionSummary {
	id: string;
	agent_id: string;
	is_deployed: boolean;
	user_id: string;
	created_at: string;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

export interface PullOpts extends CommonOpts {
	versionId?: string;
	env?: string;
	output?: string;
}

export interface PushOpts extends CommonOpts {
	file?: string;
	deploy?: string;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

function parseEnv(value: string | undefined, flag: string): Env | undefined {
	if (value === undefined) return undefined;
	if (value !== "staging" && value !== "production") {
		fail(`${flag} must be "staging" or "production" (got "${value}").`);
	}
	return value;
}

async function fetchAgent(client: ApiClient, agentId: string): Promise<Agent> {
	try {
		const res = await client.ws<{ data: Agent }>(`/agents/${agentId}`);
		return res.data;
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Agent "${agentId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}
}

async function resolveVersionId(
	client: ApiClient,
	agentId: string,
	opts: { version?: string; env?: Env },
): Promise<string> {
	if (opts.version) return opts.version;

	const agent = await fetchAgent(client, agentId);

	if (opts.env) {
		const id =
			opts.env === "production"
				? agent.production_version_id
				: agent.staging_version_id;
		if (!id) {
			fail(`Agent "${agentId}" has no ${opts.env} version deployed.`);
		}
		return id;
	}

	if (agent.production_version_id) return agent.production_version_id;
	if (agent.staging_version_id) return agent.staging_version_id;

	const list = await client.ws<{ data: VersionSummary[] }>(
		`/agents/${agentId}/versions`,
		{ query: { limit: "1" } },
	);
	if (list.data.length === 0) {
		fail(
			`Agent "${agentId}" has no versions yet. Push one with: agent0 prompt push ${agentId} -f prompt.json`,
		);
	}
	return list.data[0].id;
}

export async function promptPullCommand(
	agentId: string,
	opts: PullOpts,
): Promise<void> {
	if (opts.versionId && opts.env) {
		fail("--version-id and --env are mutually exclusive.");
	}
	const env = parseEnv(opts.env, "--env");

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const versionId = await resolveVersionId(client, agentId, {
		version: opts.versionId,
		env,
	});

	let version: Version;
	try {
		const res = await client.ws<{ data: Version }>(
			`/agents/${agentId}/versions/${versionId}`,
		);
		version = res.data;
	} catch (err) {
		if (getStatus(err) === 404) {
			fail(`Version "${versionId}" not found on agent "${agentId}".`);
		}
		fail(extractErrorMessage(err));
	}

	const body = `${JSON.stringify(version.data, null, 2)}\n`;

	if (opts.output) {
		await writeFile(opts.output, body);
		if (!shouldEmitJson(opts)) {
			console.log(
				`Wrote version ${version.id} (agent ${agentId}) to ${opts.output}.`,
			);
		}
		return;
	}

	process.stdout.write(body);
}

export async function promptPushCommand(
	agentId: string,
	opts: PushOpts,
): Promise<void> {
	if (!opts.file) {
		fail("--file (-f) is required (e.g. `-f prompt.json`).");
	}
	const deploy = parseEnv(opts.deploy, "--deploy");

	let raw: string;
	try {
		raw = await readFile(opts.file, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT") fail(`File not found: ${opts.file}`);
		fail(extractErrorMessage(err));
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		fail(
			`Could not parse ${opts.file} as JSON: ${(err as Error).message}`,
		);
	}

	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		fail(`${opts.file} must contain a JSON object at the top level.`);
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const query: Record<string, string> = {};
	if (deploy) query.deploy = deploy;

	let res: { data: Version };
	try {
		res = await client.ws<{ data: Version }>(`/agents/${agentId}/versions`, {
			method: "POST",
			body: { data: parsed },
			query,
		});
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail(
				"Pushing prompt versions requires a personal access token (API keys can't write).",
			);
		}
		if (status === 404) {
			fail(`Agent "${agentId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	const deployedSuffix = deploy ? ` (deployed to ${deploy})` : "";
	console.log(
		`Pushed version ${res.data.id} for agent ${agentId}${deployedSuffix}.`,
	);
	console.log(res.data.id);
}
