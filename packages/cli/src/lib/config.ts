import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONFIG_PATH = join(
	homedir(),
	".config",
	"agent0",
	"config.json",
);

export interface Profile {
	url: string;
	token: string;
	workspace_id: string;
}

export interface Config {
	active: string | null;
	profiles: Record<string, Profile>;
}

const EMPTY_CONFIG: Config = { active: null, profiles: {} };

export async function readConfig(): Promise<Config> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as Partial<Config>;
		return {
			active: parsed.active ?? null,
			profiles: parsed.profiles ?? {},
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { active: EMPTY_CONFIG.active, profiles: { ...EMPTY_CONFIG.profiles } };
		}
		throw err;
	}
}

export async function writeConfig(config: Config): Promise<void> {
	await mkdir(dirname(CONFIG_PATH), { recursive: true });
	await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
	await chmod(CONFIG_PATH, 0o600);
}

export interface ResolvedProfile extends Profile {
	name: string;
}

export interface ResolveOpts {
	profile?: string;
	url?: string;
	workspace?: string;
}

export async function resolveProfile(
	opts: ResolveOpts = {},
): Promise<ResolvedProfile | null> {
	const config = await readConfig();
	const env = process.env;

	const profileName = opts.profile ?? env.AGENT0_PROFILE ?? config.active ?? null;
	const base = profileName ? config.profiles[profileName] : undefined;

	const url = opts.url ?? env.AGENT0_URL ?? base?.url;
	const token = env.AGENT0_TOKEN ?? base?.token;
	const workspace_id =
		opts.workspace ?? env.AGENT0_WORKSPACE ?? base?.workspace_id;

	if (!url || !token || !workspace_id) return null;

	return {
		name: profileName ?? "(env)",
		url,
		token,
		workspace_id,
	};
}

export async function requireProfile(
	opts: ResolveOpts = {},
): Promise<ResolvedProfile> {
	const resolved = await resolveProfile(opts);
	if (!resolved) {
		console.error(
			"No agent0 profile configured. Run `agent0 login` to set one up.",
		);
		process.exit(1);
	}
	return resolved;
}
