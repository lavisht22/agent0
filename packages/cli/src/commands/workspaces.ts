import {
	readConfig,
	requireProfile,
	type ResolveOpts,
	writeConfig,
} from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface WorkspacesResponse {
	data: Array<{
		id: string;
		name: string;
		role: "admin" | "writer" | "reader";
		created_at: string;
	}>;
}

interface ListOpts extends ResolveOpts {
	json?: boolean;
}

interface UseOpts extends ResolveOpts {}

async function fetchWorkspaces(opts: ResolveOpts): Promise<WorkspacesResponse> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);
	try {
		return await client.api<WorkspacesResponse>("/workspaces");
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail("Listing workspaces requires a personal access token (API keys can't enumerate workspaces).");
		}
		fail(extractErrorMessage(err));
	}
}

export async function workspacesListCommand(opts: ListOpts): Promise<void> {
	const workspaces = await fetchWorkspaces(opts);
	const profile = await requireProfile(opts);

	if (opts.json ?? !process.stdout.isTTY) {
		printJson(workspaces.data, { json: opts.json });
		return;
	}

	if (workspaces.data.length === 0) {
		console.log("(no workspaces)");
		return;
	}

	for (const ws of workspaces.data) {
		const marker = ws.id === profile.workspace_id ? "*" : " ";
		console.log(`${marker} ${ws.id}  ${ws.role.padEnd(7)}  ${ws.name}`);
	}
}

export async function workspacesUseCommand(
	workspaceId: string,
	opts: UseOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const workspaces = await fetchWorkspaces(opts);

	const target = workspaces.data.find((w) => w.id === workspaceId);
	if (!target) {
		fail(
			`You are not a member of workspace "${workspaceId}". Run \`agent0 workspaces list\` to see options.`,
		);
	}

	const config = await readConfig();
	const stored = config.profiles[profile.name];
	if (!stored) {
		fail(`Active profile "${profile.name}" is not stored in config (resolved from env). Cannot persist workspace change.`);
	}
	stored.workspace_id = workspaceId;
	await writeConfig(config);

	console.log(`Profile "${profile.name}" is now using workspace "${target.name}" (${target.id}).`);
}
