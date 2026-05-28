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
import { mcpsListCommand, mcpsRefreshCommand } from "./commands/mcps.js";
import { promptPullCommand, promptPushCommand } from "./commands/prompt.js";
import { providersListCommand } from "./commands/providers.js";
import { runCommand } from "./commands/run.js";
import { runsGetCommand, runsListCommand } from "./commands/runs.js";
import {
	tagsCreateCommand,
	tagsDeleteCommand,
	tagsListCommand,
} from "./commands/tags.js";
import { useCommand } from "./commands/use.js";
import {
	versionsDeployCommand,
	versionsGetCommand,
	versionsListCommand,
} from "./commands/versions.js";
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

cli
	.command(
		"versions [action] [agentId] [versionId]",
		"Manage agent versions — actions: list <agentId>, get <agentId> <versionId>, deploy <agentId> <versionId> --env staging|production",
	)
	.option("--page <n>", "Page number (list)", { default: "1" })
	.option("--limit <n>", "Items per page, max 100 (list)", { default: "20" })
	.option("--env <env>", "Deploy target: staging or production (deploy)")
	.action(
		(
			action: string | undefined,
			agentId: string | undefined,
			versionId: string | undefined,
			opts,
		) => {
			switch (action) {
				case undefined:
					cli.outputHelp();
					return;
				case "list":
				case "ls":
					if (!agentId) fail("Usage: agent0 versions list <agentId>");
					return run(() => versionsListCommand(agentId, opts));
				case "get":
					if (!agentId || !versionId)
						fail("Usage: agent0 versions get <agentId> <versionId>");
					return run(() => versionsGetCommand(agentId, versionId, opts));
				case "deploy":
					if (!agentId || !versionId)
						fail(
							"Usage: agent0 versions deploy <agentId> <versionId> --env staging|production",
						);
					return run(() => versionsDeployCommand(agentId, versionId, opts));
				default:
					fail(
						`Unknown versions action: "${action}". Try: list <agentId>, get <agentId> <versionId>, deploy <agentId> <versionId> --env ...`,
					);
			}
		},
	);

cli
	.command("run [agentId]", "Run an agent and print the JSON response")
	.option(
		"--input <text>",
		"Sets the `input` variable (shorthand for --var input=...)",
	)
	.option("--env <env>", "Environment: staging or production (default: production)")
	.option(
		"--var <pair>",
		"Set a variable as key=value; repeatable for multiple variables.",
	)
	.action((agentId: string | undefined, opts) => {
		if (!agentId) fail("Usage: agent0 run <agentId> --input '...'");
		return run(() => runCommand(agentId, opts));
	});

cli
	.command(
		"runs [action] [target]",
		"Inspect runs — actions: list [--agent <id>] [--status success|failed] [--from <iso>] [--to <iso>], get <runId>",
	)
	.option("--agent <id>", "Filter by agent ID (list)")
	.option("--status <status>", "Filter by status: success or failed (list)")
	.option("--from <iso>", "Only runs created on or after this ISO date (list)")
	.option("--to <iso>", "Only runs created on or before this ISO date (list)")
	.option("--page <n>", "Page number (list)", { default: "1" })
	.option("--limit <n>", "Items per page, max 100 (list)", { default: "20" })
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => runsListCommand(opts));
			case "get":
				if (!target) fail("Usage: agent0 runs get <runId>");
				return run(() => runsGetCommand(target, opts));
			default:
				fail(
					`Unknown runs action: "${action}". Try: list, get <runId>.`,
				);
		}
	});

cli
	.command(
		"tags [action] [target]",
		"Manage tags — actions: list | ls, create --name ... --color ..., delete <id>",
	)
	.option("--name <name>", "Tag name (create)")
	.option("--color <hex>", 'Tag color, e.g. "#aabbcc" (create)')
	.option("-y, --yes", "Skip the confirmation prompt (delete)")
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => tagsListCommand(opts));
			case "create":
				return run(() => tagsCreateCommand(opts));
			case "delete":
			case "rm":
				if (!target) fail("Usage: agent0 tags delete <id>");
				return run(() => tagsDeleteCommand(target, opts));
			default:
				fail(
					`Unknown tags action: "${action}". Try: list, create --name ... --color ..., delete <id>.`,
				);
		}
	});

cli
	.command(
		"providers [action]",
		"Inspect providers — actions: list | ls",
	)
	.action((action: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => providersListCommand(opts));
			default:
				fail(`Unknown providers action: "${action}". Try: list.`);
		}
	});

cli
	.command(
		"mcps [action] [target]",
		"Manage MCP servers — actions: list | ls, refresh <id>",
	)
	.action((action: string | undefined, target: string | undefined, opts) => {
		switch (action) {
			case undefined:
				cli.outputHelp();
				return;
			case "list":
			case "ls":
				return run(() => mcpsListCommand(opts));
			case "refresh":
				if (!target) fail("Usage: agent0 mcps refresh <id>");
				return run(() => mcpsRefreshCommand(target, opts));
			default:
				fail(
					`Unknown mcps action: "${action}". Try: list, refresh <id>.`,
				);
		}
	});

cli.command("").action(() => {
	cli.outputHelp();
});

cli.help();
cli.version(pkg.version);

cli.parse();
