import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface MeResponse {
	data: {
		user_id: string;
		user_email: string | null;
		user_name: string | null;
		token_id: string;
	};
}

interface WorkspacesResponse {
	data: Array<{
		id: string;
		name: string;
		role: "admin" | "writer" | "reader";
	}>;
}

interface WhoamiOpts extends ResolveOpts {
	json?: boolean;
}

export async function whoamiCommand(opts: WhoamiOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let me: MeResponse;
	let workspaces: WorkspacesResponse;
	try {
		[me, workspaces] = await Promise.all([
			client.api<MeResponse>("/me"),
			client.api<WorkspacesResponse>("/workspaces"),
		]);
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail("The configured token has no user identity (likely an API key). `whoami` requires a personal access token.");
		}
		if (status === 401) {
			fail("Token is invalid or revoked. Run `agent0 login` to re-authenticate.");
		}
		fail(extractErrorMessage(err));
	}

	const current = workspaces.data.find((w) => w.id === profile.workspace_id);

	const result = {
		profile: profile.name,
		url: profile.url,
		user_id: me.data.user_id,
		user_email: me.data.user_email,
		user_name: me.data.user_name,
		workspace_id: profile.workspace_id,
		workspace_name: current?.name ?? null,
		workspace_role: current?.role ?? null,
	};

	if (opts.json ?? !process.stdout.isTTY) {
		printJson(result, { json: opts.json });
		return;
	}

	const lines = [
		`Profile:    ${result.profile}`,
		`URL:        ${result.url}`,
		`User:       ${result.user_email ?? result.user_id}${result.user_name ? ` (${result.user_name})` : ""}`,
		`Workspace:  ${result.workspace_name ?? result.workspace_id}${result.workspace_role ? ` [${result.workspace_role}]` : ""}`,
	];
	console.log(lines.join("\n"));
}
