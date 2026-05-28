import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };
import {
	agentsCreateCommand,
	agentsGetCommand,
	agentsListCommand,
	agentsRenameCommand,
} from "./commands/agents.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { promptPullCommand, promptPushCommand } from "./commands/prompt.js";
import { useCommand } from "./commands/use.js";
import { whoamiCommand } from "./commands/whoami.js";
import {
	workspacesListCommand,
	workspacesUseCommand,
} from "./commands/workspaces.js";
import { extractErrorMessage, fail } from "./lib/errors.js";

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

// cac matches commands by argv[0] only, so we can't register "agents list" as
// its own command — we register one parent command per group and dispatch on
// the [action] positional. This also fixes the same bug in `workspaces list`
// that shipped silently in T3.2.
cli
	.command(
		"workspaces [action] [target]",
		"Manage workspaces — actions: list | ls, use <id>",
	)
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => workspacesListCommand(opts));
			case "use":
				if (!target) fail("Usage: agent0 workspaces use <id>");
				return run(() => workspacesUseCommand(target, opts));
			default:
				fail(
					`Unknown workspaces action: "${action}". Try: list, ls, use <id>.`,
				);
		}
	});

cli
	.command(
		"agents [action] [target]",
		"Manage agents — actions: list | ls [--search ...] [--tag ...]…, get <id>, create --name ... [--tag ...]…, rename <id> --name ...",
	)
	.option("--search <term>", "Filter agents by name substring (list)")
	.option(
		"--tag <name>",
		"Tag name; repeatable. Filters on list, attaches on create.",
	)
	.option("--page <n>", "Page number (list)", { default: "1" })
	.option("--limit <n>", "Items per page, max 100 (list)", { default: "20" })
	.option("--name <name>", "Agent name (create, rename)")
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => agentsListCommand(opts));
			case "get":
				if (!target) fail("Usage: agent0 agents get <id>");
				return run(() => agentsGetCommand(target, opts));
			case "create":
				return run(() => agentsCreateCommand(opts));
			case "rename":
				if (!target) fail("Usage: agent0 agents rename <id> --name ...");
				return run(() => agentsRenameCommand(target, opts));
			default:
				fail(
					`Unknown agents action: "${action}". Try: list, get <id>, create, rename <id>.`,
				);
		}
	});

cli
	.command(
		"prompt [action] [target]",
		"Pull/push agent prompt versions — actions: pull <agentId> [--version-id <id>] [--env staging|production] [-o file], push <agentId> -f file [--deploy staging|production]",
	)
	.option("--version-id <id>", "Pull a specific version by ID (pull)")
	.option("--env <env>", "Pull the staging or production version (pull)")
	.option("-o, --output <file>", "Write to file instead of stdout (pull)")
	.option("-f, --file <file>", "JSON file to push as a new version (push)")
	.option(
		"--deploy <env>",
		"Also deploy the new version to staging or production (push)",
	)
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "pull":
				if (!target) fail("Usage: agent0 prompt pull <agentId>");
				return run(() => promptPullCommand(target, opts));
			case "push":
				if (!target) fail("Usage: agent0 prompt push <agentId> -f <file>");
				return run(() => promptPushCommand(target, opts));
			default:
				fail(
					`Unknown prompt action: "${action}". Try: pull <agentId>, push <agentId> -f file.`,
				);
		}
	});

cli.command("").action(() => {
	cli.outputHelp();
});

cli.help();
cli.version(pkg.version);

cli.parse();
