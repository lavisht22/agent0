# agent0-cli

Command-line interface for [agent0](https://github.com/lavisht22/agent0) — the open-source platform for building, running, and monitoring AI agents. Lets you (and AI coding tools like Claude Code, Cursor, and Codex) manage agents, prompt versions, runs, tags, providers, and MCP servers from a shell.

## Install

```bash
npm install -g agent0-cli
```

The package installs an `agent0` binary. Requires Node 20+.

## Quick start

```bash
# Sign in to a deployment (prompts for URL + personal access token)
agent0 login

# List your agents
agent0 agents list

# Pull a prompt, edit it, push a new version, deploy to staging
agent0 prompt pull <agentId> -o prompt.json
# ... edit prompt.json ...
agent0 prompt push <agentId> -f prompt.json --deploy staging

# Run an agent
agent0 run <agentId> --input "..."

# Inspect failed runs
agent0 runs list --status failed
agent0 runs get <runId>
```

## Authentication

The CLI uses **personal access tokens** (PATs), bound to your user. Mint one at:

```
<your-agent0-url>/account/personal-access-tokens
```

Tokens start with `agent0_pat_`. They inherit your role in whichever workspace each request targets.

API keys (`x-api-key`) are accepted at runtime for read/run flows, but `agent0 login` is PAT-only — keys can't bootstrap a profile.

## Profiles

Config lives at `~/.config/agent0/config.json` (mode 0600). It supports multiple deployments (cloud, self-hosted, etc.):

```jsonc
{
  "active": "default",
  "profiles": {
    "default":  { "url": "https://...", "token": "agent0_pat_...", "workspace_id": "ws_..." },
    "selfhost": { "url": "https://agent0.acme.internal", "token": "...", "workspace_id": "..." }
  }
}
```

Resolution order for each field: explicit flag (`--profile`, `--url`, `--workspace`) → env (`AGENT0_PROFILE`, `AGENT0_URL`, `AGENT0_TOKEN`, `AGENT0_WORKSPACE`) → active profile in config.

```bash
agent0 use <profile>          # Switch active profile
agent0 whoami                 # Show signed-in identity
agent0 logout                 # Revoke token + remove profile
agent0 workspaces list        # Show every workspace your PAT can act in
agent0 workspaces use <id>    # Change active workspace on this profile
```

## Commands

```
agents       list | get <id> | create --name ... | rename <id> --name ...
prompt       pull <agentId> [--version-id <id>] [--env staging|production] [-o file]
             push <agentId> -f file [--deploy staging|production]
versions     list <agentId> | get <agentId> <versionId>
             deploy <agentId> <versionId> --env staging|production
run          <agentId> --input "..." [--env staging|production] [--var key=val]...
runs         list [--agent <id>] [--status success|failed] [--from <iso>] [--to <iso>]
             get <runId>
tags         list | create --name ... --color "#..." | delete <id>
providers    list
mcps         list | refresh <id>
workspaces   list | use <id>
```

Add `--json` to any read command for raw JSON output (also the default when stdout is not a TTY, so commands pipe cleanly).

## Output

- TTY: aligned plain-text rendering for easy human scanning.
- Non-TTY or `--json`: JSON payload (compact when piped, pretty when forced with `--json`).

## License

ISC
