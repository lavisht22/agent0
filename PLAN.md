# agent0 CLI & Skill Plan

Tracking document for exposing agent0's full functionality to AI tools (Claude Code, Cursor, etc.) via a CLI, plus an installable skill that teaches those tools how to use it.

We work through this **one task at a time**, one PR per task, in roughly the order listed.

---

## Locked-in decisions

- **CLI over MCP** as the primary surface. CLI reaches every AI tool with shell access, plus humans and CI. A thin MCP wrapper may come later.
- **`agent0 run` returns JSON by default.** No streaming flag at v1.
- **No conflict handling on `prompt push`.** Last write wins.
- **Existing API keys are sufficient.** No changes to the auth layer; the CLI sends `x-api-key` against the same `/api/v1/*` endpoints.
- **`PATCH /api/v1/agents/:id` handles deployment.** Setting `staging_version_id` / `production_version_id` is just a field update. Single scope (`agents:write:<id>`) covers rename, tag sync, and deploy.
- **Tags are folded into the agent PATCH** as `tag_ids: string[]` (replaces the set).
- **Prompt edits use a pull/push file flow**, not JSON-in-args. AI tools edit the file with their native Read/Edit tools.
- **CLI is its own package** (`packages/cli`, published as `agent0-cli`). The SDK (`packages/agent0`) stays thin — it's for JS apps that want to embed agent runs. The CLI brings its own HTTP client covering the full CRUD surface and does not depend on the SDK.

---

## Architecture overview

```
+--------------------+        x-api-key         +-----------------------+
|  agent0 CLI        |  ----------------------> |  apps/runner          |
|  (packages/cli)    |  /api/v1/* (HTTPS+JSON)  |  Fastify + Supabase   |
+--------------------+                          +-----------------------+
        ^                                                 |
        | reads/writes ~/.config/agent0/config.json       v
        |                                          +----------------+
+--------------------+                             |   Supabase     |
|  AI tool (Claude   |  shells out to `agent0`     +----------------+
|  Code, Cursor, …)  |  + reads installed skill
+--------------------+
```

- Frontend continues to talk directly to Supabase. The CLI never touches Supabase directly — it goes through `/api/v1/*`, which means we're forced to design clean, scope-checked endpoints that any third party can use.
- The "prompt" itself is the opaque JSON in `agent_versions.data`. The API treats it as a blob; only the runner interprets it. CLI pulls it to a file, AI edits the file, CLI pushes it back as a new version.

---

## New scopes

Existing scope model (`apps/runner/src/lib/scopes.ts`): three segments, `resource:action:id`, `*` wildcard per segment.

**Already in use:** `agents:read:*`, `agents:read:<id>`, `agents:run:*`, `agents:run:<id>`, `runs:read:*`.

**New scopes to introduce:**

| Scope | Used by |
|---|---|
| `agents:write:*` | `POST /api/v1/agents` |
| `agents:write:<id>` | `PATCH /api/v1/agents/:id`, `POST /api/v1/agents/:id/versions` |
| `tags:read:*` | `GET /api/v1/tags` |
| `tags:write:*` | `POST /api/v1/tags`, `DELETE /api/v1/tags/:id` |
| `providers:read:*` | `GET /api/v1/providers` |
| `mcps:read:*` | `GET /api/v1/mcps` |
| `mcps:write:*` | `POST /api/v1/mcps/:id/refresh` |

No engine changes needed — `scopes.ts` already handles arbitrary strings. The work is:
1. Allow these scopes to be selected when creating an API key in the dashboard.
2. Reference them in the new route preHandlers.

---

## Tasks

### Phase 0 — Foundation

- [ ] **T0.1 — Add new scope strings to the dashboard's key-creation UI.**
  - File: web app key creation form (wherever scopes are picked).
  - Adds the seven new scopes from the table above as selectable options.
  - No backend change — `scopes.ts` is already string-based.

- [ ] **T0.2 — `GET /api/v1/me` (whoami).**
  - New route file `apps/runner/src/routes/me.ts`, registered in the API-key-authed group.
  - Returns `{ workspace_id, scopes, allowed_origins }` for the calling key.
  - No new scope required (any valid key can call it).

### Phase 1 — Backend write endpoints (one PR each)

- [ ] **T1.1 — `POST /api/v1/agents` (create agent).**
  - Scope: `agents:write:*`.
  - Body: `{ name: string, data?: object, tag_ids?: string[] }`. If `data` is provided, also creates an initial `agent_versions` row.
  - Returns the created agent (same shape as `GET /api/v1/agents/:id`).
  - Reference mutation: `apps/web/src/routes/_app.workspace.$workspaceId.agents.$agentId/hooks/use-agent-mutations.tsx:25-66`.

- [ ] **T1.2 — `PATCH /api/v1/agents/:id` (rename / tags / deploy).**
  - Scope: `agents:write:<id>`.
  - Body: any subset of `{ name?, staging_version_id?, production_version_id?, tag_ids? }`.
  - Validate that any version_id being assigned belongs to this agent.
  - If `tag_ids` is present, replace the agent's tag set (delete + insert, matching `use-agent-mutations.tsx:164-183`).
  - Returns the updated agent.

- [ ] **T1.3 — `POST /api/v1/agents/:id/versions` (push new prompt version).**
  - Scope: `agents:write:<id>`.
  - Body: `{ data: object }` — opaque JSON, stored as-is.
  - Optional query: `?deploy=staging|production` — if set, also updates the corresponding `*_version_id` on the agent in the same response.
  - Returns the created version (same shape as `GET /api/v1/agents/:id/versions/:versionId`).
  - This is the headline endpoint for the CLI `prompt push` flow.

- [ ] **T1.4 — `GET /api/v1/tags`, `POST /api/v1/tags`, `DELETE /api/v1/tags/:id`.**
  - Scopes: `tags:read:*` for GET, `tags:write:*` for POST/DELETE.
  - Tag fields: `id`, `name`, `color`, `workspace_id`.
  - DELETE cascades on `agent_tags` (verify the FK already does this; otherwise delete manually first).

- [ ] **T1.5 — `GET /api/v1/providers`.**
  - Scope: `providers:read:*`.
  - Returns `id, name, type, created_at, updated_at, has_staging_config`. **Never** returns the encrypted blobs.
  - Mirrors `apps/web/src/lib/queries.ts:22-42`.

- [ ] **T1.6 — `GET /api/v1/mcps` + `POST /api/v1/mcps/:id/refresh`.**
  - Scopes: `mcps:read:*` for GET, `mcps:write:*` for refresh.
  - List response mirrors `queries.ts:44-64` (no encrypted blobs).
  - Refresh: promote the existing internal `/internal/refresh-mcp` (`apps/runner/src/routes/refresh-mcp.ts`) — extract the core logic, expose it under `/api/v1/`, keep the internal route as a thin wrapper.

### Phase 2 — OpenAPI publishing

- [ ] **T2.1 — Wire `@fastify/swagger` + `@fastify/swagger-ui`.**
  - Existing routes already have Fastify schemas (see `apps/runner/src/routes/agents.ts`). Make sure new routes from Phase 1 are schema-complete too.
  - Serve the spec at `/api/v1/openapi.json` and Swagger UI at `/api/v1/docs`.
  - Lets third parties generate clients and lets us auto-generate a future MCP wrapper.

### Phase 3 — CLI package scaffold (new `packages/cli`)

- [ ] **T3.1 — Scaffold `packages/cli`, published as `agent0-cli`.**
  - New workspace package; binary name is `agent0` (so `npm i -g agent0-cli` installs the `agent0` command).
  - `package.json` with `bin: { agent0: "dist/index.js" }`, TypeScript build to `dist/`, shebang line.
  - Argv parser: `cac` (small, sufficient).
  - Own HTTP client — does **not** depend on `packages/agent0` (the SDK stays thin).
  - Config loader: reads `AGENT0_API_KEY` env var or `~/.config/agent0/config.json` (env wins).
  - Global flags: `--json` (default true for read commands), `--api-base` (override default `https://…`).

- [ ] **T3.2 — `agent0 login` + `agent0 whoami`.**
  - `login`: prompts for an API key, writes `~/.config/agent0/config.json` (mode 0600), confirms by calling `/api/v1/me`.
  - `logout`: deletes the config file.
  - `whoami`: calls `/api/v1/me`, prints workspace + scopes.

- [ ] **T3.3 — `agent0 agents` commands.**
  - `agents list [--search …] [--tag …] [--page N] [--limit N]`
  - `agents get <id>`
  - `agents create --name … [--from-file prompt.json] [--tag …]…`
  - `agents rename <id> --name …`
  - All return JSON; pretty-print only if stdout is a TTY and `--json` not explicitly passed.

- [ ] **T3.4 — `agent0 prompt pull` + `agent0 prompt push` (the headline).**
  - `prompt pull <agentId> [--version <id>] [--env staging|production] [-o file.json]`
    - Default version: production if it exists, else staging, else latest.
    - Writes the version's `data` JSON to a file (or stdout if no `-o`).
  - `prompt push <agentId> -f file.json [--deploy staging|production]`
    - Reads the file, POSTs as a new version, optionally deploys.
    - Prints the new version_id.

- [ ] **T3.5 — `agent0 versions` commands.**
  - `versions list <agentId>`
  - `versions get <agentId> <versionId>`
  - `versions deploy <agentId> <versionId> --env staging|production`
    - Implemented as a PATCH on the agent — reuses T1.2.

- [ ] **T3.6 — `agent0 run`.**
  - `run <agentId> --input "…" [--env staging|production] [--var key=val]…`
  - JSON output by default (entire response collected, no streaming at v1).

- [ ] **T3.7 — `agent0 runs` commands.**
  - `runs list [--agent <id>] [--status success|failed] [--from <date>] [--to <date>]`
  - `runs get <runId>`

- [ ] **T3.8 — `agent0 tags`, `agent0 providers`, `agent0 mcps` commands.**
  - `tags list/create/delete`
  - `providers list`
  - `mcps list`, `mcps refresh <id>`

- [ ] **T3.9 — Publish `agent0-cli` to npm.**
  - Verify `bin` works after `npm install -g agent0-cli` (command is `agent0`).
  - Publish stable v1.

### Phase 4 — Skill for AI tools

- [ ] **T4.1 — Author the agent0 skill bundle.**
  - Lives in `skills/agent0/` in this repo.
  - Contents:
    - `SKILL.md` with frontmatter (`name: agent0`, description telling the AI when to use it) and body explaining: what agent0 is, when the skill applies (any time the user mentions editing prompts, agents, deploying versions, etc.), and the canonical CLI workflows.
    - Sub-pages for less-common operations (e.g. `reference/runs.md`, `reference/scopes.md`) so the main `SKILL.md` stays scannable.
  - Headline workflows the skill must teach:
    1. **Edit a prompt:** `agent0 prompt pull <id> -o /tmp/p.json` → edit file → `agent0 prompt push <id> -f /tmp/p.json --deploy staging`.
    2. **Run an agent:** `agent0 run <id> --input "…"`.
    3. **Find an agent:** `agent0 agents list --search "…"`.
    4. **Inspect a failed run:** `agent0 runs list --status failed` → `agent0 runs get <id>`.
  - Includes a "do not" section: do not try to construct the full prompt JSON inline — always pull, edit, push.

- [ ] **T4.2 — Publish the skill so it installs via `npx skills`.**
  - Confirm the exact publishing target (Anthropic skills registry / a GitHub-released bundle / npm). Documented in this task once verified.
  - Add a one-liner to the project README: `npx skills add agent0` so users can install with a single command.

### Phase 5 — Docs & launch

- [ ] **T5.1 — README + dashboard onboarding.**
  - Add a "Use agent0 from your AI tools" section to the project README pointing at `npm i -g agent0-cli` and `npx skills add agent0`.
  - Add a panel in the dashboard's API-keys page suggesting users install the skill, with the exact command and a copy button.

- [ ] **T5.2 — Announce.**
  - Changelog entry, social post, email to existing API-key holders.

---

## Out of scope (revisit later)

- **MCP server.** Once the CLI and OpenAPI spec are stable, a thin MCP wrapper is a few hundred lines. Skip until there's clear demand from users on tools that *only* support MCP.
- **OAuth login flow** (`gh auth login` style). Paste-the-key is fine for v1.
- **Prompt diffing as a server feature.** If we want it, do it client-side first (`agent0 prompt diff --from <vA> --to <vB>` just pulls both and diffs locally).
- **Streaming `agent0 run`.** JSON-only at v1 per the locked-in decision.
- **Static binary distribution.** npm-only for v1; every target user (Claude Code / Cursor / Codex CLI) already has Node. Revisit (via `bun build --compile` + GitHub Releases + Homebrew tap) if sandboxed-env users ask for it.

---

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done (link the PR)
