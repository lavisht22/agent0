import { readConfig, writeConfig } from "../lib/config.js";
import { fail } from "../lib/errors.js";

export async function useCommand(profileName: string): Promise<void> {
	const config = await readConfig();
	if (!config.profiles[profileName]) {
		const available = Object.keys(config.profiles);
		fail(
			`No profile named "${profileName}".${
				available.length
					? ` Available: ${available.join(", ")}.`
					: " Run `agent0 login` to create one."
			}`,
		);
	}
	config.active = profileName;
	await writeConfig(config);
	console.log(`Active profile is now "${profileName}".`);
}
