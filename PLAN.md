# agent0 CLI & Skill Plan

Tracking document for exposing agent0's full functionality to AI tools (Claude Code, Cursor, etc.) via a CLI, plus an installable skill that teaches those tools how to use it.

We work through this **one task at a time**, one PR per task, in roughly the order listed.

> **Note to the AI assistant working this plan:** before starting any task below, pause and surface open questions about the task — design choices, ambiguities, dependencies, anything the task description doesn't pin down. Don't dive in until those are answered. The decisions made along the way feed back into this document.

---

## Locked-in decisions

- **CLI over MCP** as the primary surface. CLI reaches every AI tool with shell access, plus humans and CI. A thin MCP wrapper may come later.
- **`agent0 run` returns JSON by default.** No streaming flag at v1.
- **No conflict handling on `prompt push`.** Last write wins.
- **Two auth modes, one middleware.** API keys (`x-api-key`) for machines/CI — workspace-scoped, no user identity attached. Personal Access Tokens (`Authorization: Bearer …`) for humans using the CLI — bound to a specific user + workspace. The auth middleware accepts either and populates `request.workspaceId` / `request.userId?` / `request.scopes`. Route handlers don't care which token type authenticated the caller.
- **Writes require a user; API keys are read/run-only.** Any endpoint that mutates state (creating agents, pushing versions, deploying, editing tags, refreshing MCPs) is PAT-only — enforced by a single `requireUserId` preHandler that 403s when `request.userId` is unset. This keeps `agent_versions.user_id` `NOT NULL` and gives clean per-actor attribution. API keys can list/read everything and run agents; nothing more.
- **`PATCH /api/v1/agents/:id` handles deployment.** Setting `staging_version_id` / `production_version_id` is just a field update. Single scope (`agents:write:<id>`) covers rename, tag sync, and deploy.
- **Tags are folded into the agent PATCH** as `tag_ids: string[]` (replaces the set).
- **Prompt edits use a pull/push file flow**, not JSON-in-args. AI tools edit the file with their native Read/Edit tools.
- **CLI is its own package** (`packages/cli`, published as `agent0-cli`). The SDK (`packages/agent0`) stays thin — it's for JS apps that want to embed agent runs. The CLI brings its own HTTP client covering the full CRUD surface and does not depend on the SDK.

---

## Architecture overview

```
+--------------------+   PAT (humans) /         +-----------------------+
|  agent0 CLI        |   x-api-key (machines)   |  apps/runner          |
|  (packages/cli)    |  ----------------------> |  Fastify + Supabase   |
+--------------------+  /api/v1/* (HTTPS+JSON)  +-----------------------+
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
- **Auth dispatch:** the middleware checks `Authorization: Bearer …` first (PAT, user-scoped). If absent, falls back to `x-api-key` (workspace-scoped). PAT path sets `request.userId` and grants `scopes = ["*:*:*"]` (PATs inherit the user's full workspace permissions). API-key path leaves `userId` unset and uses the explicit scope list. Routes that mutate state chain a second preHandler — `requireUserId` — which 403s when the caller is an API key.

---

## New scopes

Existing scope model (`apps/runner/src/lib/scopes.ts`): three segments, `resource:action:id`, `*` wildcard per segment.

**Already in use:** `agents:read:*`, `agents:read:<id>`, `agents:run:*`, `agents:run:<id>`, `runs:read:*`.

**Scopes added by Phase 1 tasks** (each one introduced alongside the endpoint that needs it, plus a suggestion added to the dashboard key-creation form):

| Scope | Used by | Task |
|---|---|---|
| `tags:read:*` | `GET /api/v1/tags` | T1.4 |
| `providers:read:*` | `GET /api/v1/providers` | T1.5 |
| `mcps:read:*` | `GET /api/v1/mcps` | T1.6 |

No write scopes are added — writes are PAT-only and PATs implicitly hold `*:*:*`. The `scopes.ts` engine handles arbitrary strings; the only work per scope is allowing it in the key-creation UI and referencing it in the route preHandler.

---

## Tasks

### Phase 0 — Foundation (PAT auth)

The whole CLI flow assumes per-user attribution, so PAT support has to land before any of the write endpoints in Phase 1.

- [x] **T0.1 — PAT schema + dual-auth middleware + `requireUserId` guard.** (4de358a)
  - **Migration**: new table `personal_access_tokens` — `id, user_id (fk users), workspace_id (fk workspaces), token_hash (sha256), name, created_at, last_used_at, expires_at?, revoked_at?`. Unique index on `token_hash`. One PAT binds to exactly one workspace — multi-workspace users mint one PAT per workspace.
  - **Auth middleware refactor** (`apps/runner/src/lib/auth.ts`): rename `addApiKeyAuth` → `addAuth`. The new flow tries `Authorization: Bearer …` first (look up by `token_hash`, populate `workspaceId` + `userId` + `scopes=["*:*:*"]`, update `last_used_at`). If no bearer token, falls back to the existing `x-api-key` path (populate `workspaceId` + `scopes`, leave `userId` unset). 401 if both are absent. Origin-allowlist enforcement stays API-key-only (PATs are CLI-issued, not browser-visible — origin is meaningless).
  - **Fastify request typing**: `userId` becomes `string | undefined`.
  - **`requireUserId` preHandler** in `apps/runner/src/lib/scopes.ts` (or a new `lib/auth-guards.ts`): returns `403 { message: "This endpoint requires a personal access token; API keys cannot mutate state" }` when `request.userId` is unset. Every Phase 1 write route chains this after its scope check.

- [x] **T0.2 — PAT lifecycle: dashboard UI + `/api/v1/me` + `/api/v1/auth/logout`.** (768191f)
  - **GitHub-style mint flow.** User generates a PAT on the dashboard and pastes it into the CLI. No device-code, no approval handshake — the dashboard mints directly via Supabase under RLS, the runner never sees the minting traffic.
  - **Dashboard tokens page**: lists the calling user's PATs for the current workspace with mint and revoke buttons. Place it alongside the existing API keys page. Plaintext is shown once at creation and never persisted server-side (only the SHA-256 hash lives in `personal_access_tokens.token_hash`).
  - **RLS on `personal_access_tokens`**:
    - `SELECT`: a user sees only their own tokens (`user_id = auth.uid()`).
    - `INSERT`: must set `user_id = auth.uid()` and a `workspace_id` the caller belongs to.
    - `UPDATE`: a user can revoke their own tokens (set `revoked_at`). No other field updates.
    - No `DELETE` — revocation is soft (`revoked_at`), so audits / `last_used_at` survive.
  - **`GET /api/v1/me`** (PAT-only, chains `requireUserId`): returns `{ user_id, user_email, workspace_id, workspace_name, token_id }`. Used by `agent0 whoami` and by `agent0 login` to confirm a freshly pasted token.
  - **`POST /api/v1/auth/logout`** (PAT-only, chains `requireUserId`): sets `revoked_at` on the calling token. Used by `agent0 logout`.

### Phase 1 — Backend write endpoints (one PR each)

- [ ] **T1.1 — `POST /api/v1/agents` (create agent). PAT-only.**
  - PreHandler: `requireUserId`.
  - Body: `{ name: string, tag_ids?: string[] }`. Creates an empty agent with no versions — callers push the first version separately via T1.3.
  - Validates that any provided `tag_ids` belong to the caller's workspace.
  - Returns the created agent (same shape as `GET /api/v1/agents/:id`).
  - Reference mutation: `apps/web/src/routes/_app.workspace.$workspaceId.agents.$agentId/hooks/use-agent-mutations.tsx:25-66`.

- [ ] **T1.2 — `PATCH /api/v1/agents/:id` (rename / tags / deploy). PAT-only.**
  - PreHandlers: `checkScope(agents:write:<id>)` inline + `requireUserId`. (Scope check is mostly redundant for PATs which hold `*:*:*`, but keeps the audit-friendly per-id scope language.)
  - Body: any subset of `{ name?, staging_version_id?, production_version_id?, tag_ids? }`.
  - Validate that any `version_id` being assigned belongs to this agent.
  - If `tag_ids` is present, replace the agent's tag set (delete + insert, matching `use-agent-mutations.tsx:164-183`).
  - Returns the updated agent.

- [ ] **T1.3 — `POST /api/v1/agents/:id/versions` (push new prompt version). PAT-only.**
  - PreHandlers: `checkScope(agents:write:<id>)` inline + `requireUserId`.
  - Body: `{ data: object }` — opaque JSON, stored as-is.
  - Optional query: `?deploy=staging|production` — if set, also updates the corresponding `*_version_id` on the agent in the same response.
  - Sets `user_id = request.userId` (guaranteed present because of `requireUserId`).
  - Returns the created version (same shape as `GET /api/v1/agents/:id/versions/:versionId`).
  - This is the headline endpoint for the CLI `prompt push` flow.

- [ ] **T1.4 — `GET /api/v1/tags`, `POST /api/v1/tags`, `DELETE /api/v1/tags/:id`.**
  - GET: scope `tags:read:*`. API keys allowed.
  - POST / DELETE: PAT-only (`requireUserId`). No new scope needed — PATs hold `*:*:*`.
  - Tag fields: `id`, `name`, `color`, `workspace_id`.
  - DELETE cascades on `agent_tags` (verify the FK already does this; otherwise delete manually first).
  - Adds `tags:read:*` as a suggestion in the dashboard key-creation form.

- [ ] **T1.5 — `GET /api/v1/providers`.**
  - Scope: `providers:read:*`. Read-only; API keys allowed.
  - Returns `id, name, type, created_at, updated_at, has_staging_config`. **Never** returns the encrypted blobs.
  - Mirrors `apps/web/src/lib/queries.ts:22-42`.
  - Adds `providers:read:*` as a suggestion in the dashboard key-creation form.

- [ ] **T1.6 — `GET /api/v1/mcps` + `POST /api/v1/mcps/:id/refresh`.**
  - GET: scope `mcps:read:*`. API keys allowed.
  - Refresh: PAT-only (`requireUserId`). No new scope needed.
  - List response mirrors `queries.ts:44-64` (no encrypted blobs).
  - Refresh: promote the existing internal `/internal/refresh-mcp` (`apps/runner/src/routes/refresh-mcp.ts`) — extract the core logic, expose it under `/api/v1/`, keep the internal route as a thin wrapper.
  - Adds `mcps:read:*` as a suggestion in the dashboard key-creation form.

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

- [ ] **T3.2 — `agent0 login` + `agent0 whoami` + `agent0 logout`.**
  - `login`: prompts for a token (PAT or API key — distinguished by prefix, e.g. `agent0_pat_…`). Writes it to `~/.config/agent0/config.json` (mode 0600). Confirms validity with `/api/v1/me` for PATs, or `GET /api/v1/agents?limit=1` for API keys (since API keys can't call `/me`).
  - `whoami`: calls `/api/v1/me`, prints user + workspace. Errors clearly if the stored credential is an API key.
  - `logout`: calls `POST /api/v1/auth/logout` (best-effort — for API keys this 403s and is ignored) and deletes the config file.

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
- **Prompt diffing as a server feature.** If we want it, do it client-side first (`agent0 prompt diff --from <vA> --to <vB>` just pulls both and diffs locally).
- **Streaming `agent0 run`.** JSON-only at v1 per the locked-in decision.
- **Static binary distribution.** npm-only for v1; every target user (Claude Code / Cursor / Codex CLI) already has Node. Revisit (via `bun build --compile` + GitHub Releases + Homebrew tap) if sandboxed-env users ask for it.

---

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done (link the PR)
