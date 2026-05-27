import {
	readConfig,
	requireProfile,
	type ResolveOpts,
	writeConfig,
} from "../lib/config.js";
import { extractErrorMessage } from "../lib/errors.js";
import { createClient } from "../lib/http.js";

interface LogoutOpts extends ResolveOpts {}

export async function logoutCommand(opts: LogoutOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	try {
		await client.api("/auth/logout", { method: "POST" });
		console.log(`Revoked token for profile "${profile.name}".`);
	} catch (err) {
		console.warn(
			`Server-side revoke failed (${extractErrorMessage(err)}). Removing local profile anyway.`,
		);
	}

	const config = await readConfig();
	delete config.profiles[profile.name];
	if (config.active === profile.name) {
		const remaining = Object.keys(config.profiles);
		config.active = remaining[0] ?? null;
	}
	await writeConfig(config);

	console.log(
		`Removed profile "${profile.name}"${config.active ? `. Active profile is now "${config.active}".` : ". No active profile."}`,
	);
}
