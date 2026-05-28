import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface Provider {
	id: string;
	name: string;
	type: string;
	has_staging_config: boolean;
	created_at: string;
	updated_at: string;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

export async function providersListCommand(opts: CommonOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: Provider[] };
	try {
		res = await client.ws<{ data: Provider[] }>("/providers");
	} catch (err) {
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no providers)");
		return;
	}

	for (const p of res.data) {
		const staging = p.has_staging_config ? "staging+prod" : "prod-only";
		console.log(`${p.id}  ${p.name}  ${p.type}  ${staging}`);
	}
}
