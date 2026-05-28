import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface Mcp {
	id: string;
	name: string;
	tools: Record<string, unknown> | null;
	custom_headers: Record<string, unknown> | null;
	has_staging_config: boolean;
	created_at: string;
	updated_at: string;
}

interface RefreshResponse {
	tools: Record<string, unknown>;
	errors: { env: string; message: string }[];
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

function toolCount(tools: Record<string, unknown> | null | undefined): number {
	if (!tools) return 0;
	let total = 0;
	for (const env of Object.values(tools)) {
		if (env && typeof env === "object") {
			total += Object.keys(env as Record<string, unknown>).length;
		}
	}
	return total;
}

export async function mcpsListCommand(opts: CommonOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: Mcp[] };
	try {
		res = await client.ws<{ data: Mcp[] }>("/mcps");
	} catch (err) {
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no MCP servers)");
		return;
	}

	for (const m of res.data) {
		const staging = m.has_staging_config ? "staging+prod" : "prod-only";
		console.log(`${m.id}  ${m.name}  ${staging}  ${toolCount(m.tools)} tools`);
	}
}

export async function mcpsRefreshCommand(
	mcpId: string,
	opts: CommonOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: RefreshResponse;
	try {
		res = await client.ws<RefreshResponse>(`/mcps/${mcpId}/refresh`, {
			method: "POST",
		});
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail(
				"Refreshing MCPs requires a personal access token (API keys can't write).",
			);
		}
		if (status === 404) {
			fail(`MCP server "${mcpId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	const envs = Object.keys(res.tools);
	console.log(
		`Refreshed MCP ${mcpId}: ${toolCount(res.tools)} tools across ${envs.length} env${envs.length === 1 ? "" : "s"} (${envs.join(", ") || "none"}).`,
	);
	if (res.errors.length > 0) {
		console.log("Errors:");
		for (const e of res.errors) {
			console.log(`  ${e.env}: ${e.message}`);
		}
	}
}
