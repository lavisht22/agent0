import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface RunResponse {
	text: string;
	messages: unknown[];
}

export interface RunOpts extends ResolveOpts {
	json?: boolean;
	input?: string;
	env?: string;
	var?: string | string[];
}

function parseEnv(value: string | undefined): "staging" | "production" {
	if (value === undefined) return "production";
	if (value !== "staging" && value !== "production") {
		fail(`--env must be "staging" or "production" (got "${value}").`);
	}
	return value;
}

function buildVariables(opts: RunOpts): Record<string, string> {
	const vars: Record<string, string> = {};
	const raw = Array.isArray(opts.var) ? opts.var : opts.var ? [opts.var] : [];
	for (const entry of raw) {
		const eq = entry.indexOf("=");
		if (eq < 0) {
			fail(`--var must be in key=value form (got "${entry}").`);
		}
		const key = entry.slice(0, eq).trim();
		const value = entry.slice(eq + 1);
		if (!key) {
			fail(`--var key is empty in "${entry}".`);
		}
		vars[key] = value;
	}
	if (opts.input !== undefined) {
		if ("input" in vars) {
			fail(
				"--input and --var input=... both set; pick one (they map to the same variable).",
			);
		}
		vars.input = opts.input;
	}
	return vars;
}

export async function runCommand(
	agentId: string,
	opts: RunOpts,
): Promise<void> {
	const environment = parseEnv(opts.env);
	const variables = buildVariables(opts);

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: RunResponse;
	try {
		res = await client.ws<RunResponse>("/runs", {
			method: "POST",
			body: {
				agent_id: agentId,
				environment,
				variables,
				stream: false,
			},
		});
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail(extractErrorMessage(err));
		}
		if (status === 404) {
			fail(`Agent "${agentId}" not found, or no ${environment} version deployed.`);
		}
		fail(extractErrorMessage(err));
	}

	printJson(res, { json: opts.json });
}
