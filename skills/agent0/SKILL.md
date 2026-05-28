---
name: agent0
description: "Manage agents on agent0 (open-source agent platform) from the shell — edit prompt versions, deploy to staging/production, trigger runs, inspect failed runs, and sync tags/providers/MCPs. Use whenever the user mentions editing or deploying an agent prompt, running or testing an agent, inspecting a run, or anything inside an agent0 workspace. Keywords: agent0, agent-zero, prompt version, deploy prompt, push prompt, run agent, agent run, failed run."
metadata:
  author: agent0
  version: "1.0.0"
---

# agent0

agent0 is an open-source platform for building, running, and deploying AI agents (https://github.com/lavisht22/agent0). This skill lets you drive an agent0 workspace from the terminal: edit prompts, deploy versions, run agents, and inspect failures — without touching the dashboard.

The headline workflow is **prompt editing**: pull the version's JSON to a file, edit it with your normal Read/Edit tools, push it back as a new version, optionally deploy.

---

## Bootstrap (do this once per session, before anything else)

### 1. Make sure the CLI is on PATH

```bash
agent0 --version
```

- Prints a version → ready.
- `command not found` → install it once:

  ```bash
  npm install -g agent0-cli
  ```

  Requires Node 20+. Re-run `agent0 --version` to confirm.

### 2. Make sure a profile is configured

```bash
agent0 whoami --json
```

- Prints a JSON object with `user_email` and `workspace_name` → ready.
- Errors with "No agent0 profile configured" or 401 → **the user has to log in themselves**. `agent0 login` is interactive (URL + token + workspace picker), so do not try to drive it from a non-interactive shell.

  Tell the user, verbatim:

  > Run `! agent0 login` in this prompt. You'll need:
  > - Your agent0 base URL (e.g. `https://agent0.example.com`)
  > - A personal access token, minted at `<your-agent0-url>/account/personal-access-tokens` (token starts with `agent0_pat_`)

  Wait for them to confirm before continuing.

---

## Headline workflows

### Edit a prompt and deploy

1. Find the agent ID if you don't have it:
   ```bash
   agent0 agents list --search "name fragment"
   ```
2. Pull the current version's data to a file. Defaults to production, falls back to staging, then latest:
   ```bash
   agent0 prompt pull <agentId> -o /tmp/prompt.json
   # or pin to one environment:
   agent0 prompt pull <agentId> --env staging -o /tmp/prompt.json
   ```
3. Edit `/tmp/prompt.json` with your normal tools. The file is the editable `data` blob — `model`, `messages`, `tools`, `params`. Server-managed wrapper fields (id, agent_id, created_at, etc.) are stripped; don't add them back.
4. Push as a new version. Drop `--deploy` to leave it as a draft:
   ```bash
   agent0 prompt push <agentId> -f /tmp/prompt.json --deploy staging
   ```

### Run an agent

```bash
agent0 run <agentId> --input "the user input"
agent0 run <agentId> --env staging --var input="..." --var customer_id=42
```

`--input X` is sugar for `--var input=X`. Returns `{ text, messages }` as JSON.

### Inspect a failed run

```bash
agent0 runs list --status failed --limit 10
agent0 runs get <runId>
```

`runs get` always emits JSON — the response includes full messages, tool calls, and cost.

### Find an agent

```bash
agent0 agents list --search "..."
agent0 agents get <agentId>
```

---

## Command reference

```
agents     list [--search ...] [--tag ...] [--page N] [--limit N]
           get <id>
           create --name ... [--tag ...]
           rename <id> --name ...
prompt     pull <agentId> [--version-id <id>] [--env staging|production] [-o file]
           push <agentId> -f file [--deploy staging|production]
versions   list <agentId> [--page N] [--limit N]
           get <agentId> <versionId>
           deploy <agentId> <versionId> --env staging|production
run        <agentId> --input "..." [--env staging|production] [--var key=val]...
runs       list [--agent <id>] [--status success|failed] [--from <iso>] [--to <iso>]
           get <runId>
tags       list
           create --name ... --color "#aabbcc"
           delete <id>
providers  list
mcps       list
           refresh <id>
workspaces list
           use <id>
whoami | logout | use <profile>
```

- Any read command takes `--json` for raw JSON. Piped (non-TTY) output is JSON by default.
- `--profile <name>` (or `AGENT0_PROFILE=...`) switches deployments per call. Config lives at `~/.config/agent0/config.json` and supports multiple named profiles.
- Run `agent0 <command> --help` for the authoritative flag list — the CLI is source of truth.

---

## Rules

- **Always pull, edit, push** for prompts. Never construct prompt JSON from scratch — the schema includes tool definitions, message blocks, and provider params that are easy to get wrong. Edit only what the user asked for, leave the rest as-is.
- **Don't try to drive `agent0 login`.** It's interactive; instruct the user to type `! agent0 login` themselves.
- **Default deploys to staging** unless the user explicitly says production. Production is live traffic.
- **Confirm before `agents create` or `tags delete`.** Both are mutations that survive the session.
- **API keys can't write.** If a push or PATCH returns 403 with "personal access token", the configured profile is using an API key — the user needs to log in with a PAT instead.
- **Pull a fresh copy each time you edit.** Don't reuse a stale `/tmp/prompt.json` from earlier in the session; the deployed version may have changed.
