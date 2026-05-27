import { cac } from "cac";
import pkg from "../package.json" with { type: "json" };

const cli = cac("agent0");

cli.option("--profile <name>", "Use a specific profile from config");
cli.option("--url <url>", "Override the agent0 base URL");
cli.option("--workspace <id>", "Override the active workspace");
cli.option("--json", "Force JSON output (default for non-TTY)");

cli.command("").action(() => {
	cli.outputHelp();
});

cli.help();
cli.version(pkg.version);

cli.parse();
