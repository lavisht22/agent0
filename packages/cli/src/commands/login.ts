import {
	cancel,
	intro,
	isCancel,
	note,
	outro,
	password,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { ofetch } from "ofetch";
import { readConfig, writeConfig } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";

interface LoginOpts {
	profile?: string;
	url?: string;
}

interface VersionResponse {
	name: string;
	version: string;
	api: string;
}

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
		created_at: string;
	}>;
}

function normalizeUrl(input: string): string {
	const trimmed = input.trim().replace(/\/+$/, "");
	new URL(trimmed); // throws if invalid
	return trimmed;
}

async function verifyDeployment(url: string): Promise<VersionResponse> {
	const s = spinner();
	s.start(`Verifying ${url}`);
	try {
		const res = await ofetch<VersionResponse>("/api/v1/version", {
			baseURL: url,
			retry: 0,
		});
		if (res?.name !== "agent0") {
			s.stop("Verification failed", 1);
			fail(`That URL doesn't look like an agent0 deployment (got name=${JSON.stringify(res?.name)}).`);
		}
		s.stop(`agent0 ${res.version} (api ${res.api})`);
		return res;
	} catch (err) {
		s.stop("Verification failed", 1);
		fail(
			`Could not reach ${url}/api/v1/version: ${extractErrorMessage(err)}\n` +
				"Check that the URL is correct and the server is reachable.",
		);
	}
}

export async function loginCommand(opts: LoginOpts): Promise<void> {
	const profileName = opts.profile ?? "default";

	intro("Sign in to agent0");

	let url: string;
	if (opts.url ?? process.env.AGENT0_URL) {
		url = normalizeUrl(opts.url ?? (process.env.AGENT0_URL as string));
	} else {
		const input = await text({
			message: "agent0 deployment URL",
			placeholder: "https://agent0.example.com",
			validate: (value) => {
				if (!value) return "URL is required";
				try {
					normalizeUrl(value);
					return undefined;
				} catch {
					return "Not a valid URL";
				}
			},
		});
		if (isCancel(input)) {
			cancel("Login cancelled");
			process.exit(0);
		}
		url = normalizeUrl(input as string);
	}

	await verifyDeployment(url);

	note(`Generate a personal access token at:\n  ${url}/account/personal-access-tokens`);

	const tokenInput = await password({
		message: "Paste your personal access token",
		validate: (value) => {
			if (!value) return "Token is required";
			if (!value.startsWith("agent0_pat_")) {
				return "Token should start with agent0_pat_";
			}
			return undefined;
		},
	});
	if (isCancel(tokenInput)) {
		cancel("Login cancelled");
		process.exit(0);
	}
	const token = tokenInput as string;

	const client = createClient({ url, token, workspace_id: "_" });

	const meSpinner = spinner();
	meSpinner.start("Verifying token");
	try {
		const me = await client.api<MeResponse>("/me");
		meSpinner.stop(`Signed in as ${me.data.user_email ?? me.data.user_id}`);
	} catch (err) {
		meSpinner.stop("Token verification failed", 1);
		const status = getStatus(err);
		if (status === 403) {
			fail("This token doesn't have a user identity (API keys cannot be used with `agent0 login`). Mint a personal access token from the dashboard.");
		}
		if (status === 401) {
			fail("Token is invalid or revoked. Mint a new one and try again.");
		}
		fail(extractErrorMessage(err));
	}

	const wsSpinner = spinner();
	wsSpinner.start("Loading workspaces");
	let workspaces: WorkspacesResponse;
	try {
		workspaces = await client.api<WorkspacesResponse>("/workspaces");
	} catch (err) {
		wsSpinner.stop("Failed to load workspaces", 1);
		fail(extractErrorMessage(err));
	}

	if (workspaces.data.length === 0) {
		wsSpinner.stop("No workspaces", 1);
		fail("This account isn't a member of any workspace yet. Create or join one in the dashboard, then try again.");
	}

	wsSpinner.stop(`Found ${workspaces.data.length} workspace${workspaces.data.length === 1 ? "" : "s"}`);

	let workspaceId: string;
	if (workspaces.data.length === 1) {
		workspaceId = workspaces.data[0].id;
		note(`Using workspace: ${workspaces.data[0].name}`);
	} else {
		const picked = await select({
			message: "Select a workspace",
			options: workspaces.data.map((w) => ({
				label: `${w.name}  (${w.role})`,
				value: w.id,
			})),
		});
		if (isCancel(picked)) {
			cancel("Login cancelled");
			process.exit(0);
		}
		workspaceId = picked as string;
	}

	const config = await readConfig();
	config.profiles[profileName] = {
		url,
		token,
		workspace_id: workspaceId,
	};
	if (!config.active) config.active = profileName;
	await writeConfig(config);

	const isActive = config.active === profileName;
	outro(
		`Saved profile "${profileName}"${isActive ? " (active)" : ""}. Run \`agent0 whoami\` to confirm.`,
	);
}
