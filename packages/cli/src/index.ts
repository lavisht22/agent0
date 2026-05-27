import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { useCommand } from "./commands/use.js";
import { whoamiCommand } from "./commands/whoami.js";
import {
	workspacesListCommand,
	workspacesUseCommand,
} from "./commands/workspaces.js";
import { extractErrorMessage } from "./lib/errors.js";

const cli = cac("agent0");

cli.option("--profile <name>", "Use a specific profile from config");
cli.option("--url <url>", "Override the agent0 base URL");
cli.option("--workspace <id>", "Override the active workspace");
cli.option("--json", "Force JSON output (default for non-TTY)");

function run(fn: () => Promise<void>): void {
	fn().catch((err) => {
		console.error(extractErrorMessage(err));
		process.exit(1);
	});
}

cli
	.command("login", "Sign in to an agent0 deployment")
	.action((opts) => run(() => loginCommand(opts)));

cli
	.command("whoami", "Show the currently signed-in identity")
	.action((opts) => run(() => whoamiCommand(opts)));

cli
	.command("logout", "Revoke the current token and remove its profile")
	.action((opts) => run(() => logoutCommand(opts)));

cli
	.command("use <profile>", "Switch the active profile")
	.action((profileName: string) => run(() => useCommand(profileName)));

cli
	.command("workspaces list", "List workspaces the active profile can access")
	.alias("workspaces ls")
	.action((opts) => run(() => workspacesListCommand(opts)));

cli
	.command("workspaces use <id>", "Switch the active profile to a workspace")
	.action((id: string, opts) => run(() => workspacesUseCommand(id, opts)));

cli.command("").action(() => {
	cli.outputHelp();
});

cli.help();
cli.version(pkg.version);

cli.parse();
