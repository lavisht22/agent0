# agent0 CLI & Skill Plan

Tracking document for exposing agent0's full functionality to AI tools (Claude Code, Cursor, etc.) via a CLI, plus an installable skill that teaches those tools how to use it.

We work through this **one task at a time**, one PR per task, in roughly the order listed.

> **Note to the AI assistant working this plan:** before starting any task below, pause and surface open questions about the task — design choices, ambiguities, dependencies, anything the task description doesn't pin down. Don't dive in until those are answered. The decisions made along the way feed back into this document.

---

## Locked-in decisions

- **CLI over MCP** as the primary surface. CLI reaches every AI tool with shell access, plus humans and CI. A thin MCP wrapper may come later.
- **`agent0 run` returns JSON by default.** No streaming flag at v1.
- **No conflict handling on `prompt push`.** Last write wins.
- **Two auth modes, one middleware.** API keys (`x-api-key`) for machines/CI — workspace-scoped, no user identity attached. Personal Access Tokens (`Authorization: Bearer …`) for humans using the CLI — bound to a **user only** (not a workspace). The auth middleware accepts either and populates `request.workspaceId` / `request.userId?` / `request.scopes`. Route handlers don't care which token type authenticated the caller.
- **Workspace is in the URL, not the token.** All resource routes live under `/api/v1/workspaces/:workspaceId/...`. PATs are user-bound and inherit the user's role in whichever workspace the URL targets (membership re-checked per request). API keys, which remain workspace-pinned, additionally 403 when the path's `:workspaceId` doesn't match the key's pinned workspace. A small set of identity/discovery routes (`GET /api/v1/me`, `GET /api/v1/workspaces`, `POST /api/v1/auth/logout`, `GET /api/v1/version`) stays unscoped.
- **Writes require a user; API keys are read/run-only.** Any endpoint that mutates state (creating agents, pushing versions, deploying, editing tags, refreshing MCPs) is PAT-only — enforced by a single `requireUserId` preHandler that 403s when `request.userId` is unset. This keeps `agent_versions.user_id` `NOT NULL` and gives clean per-actor attribution. API keys can list/read everything and run agents; nothing more.
- **`PATCH /api/v1/workspaces/:workspaceId/agents/:id` handles deployment.** Setting `staging_version_id` / `production_version_id` is just a field update. Single scope (`agents:write:<id>`) covers rename, tag sync, and deploy.
- **Tags are folded into the agent PATCH** as `tag_ids: string[]` (replaces the set).
- **Prompt edits use a pull/push file flow**, not JSON-in-args. AI tools edit the file with their native Read/Edit tools.
- **CLI is its own package** (`packages/cli`, published as `agent0-cli`). The SDK (`packages/agent0`) stays thin — it's for JS apps that want to embed agent runs. The CLI brings its own HTTP client covering the full CRUD surface and does not depend on the SDK.
- **CLI config is profile-based** to support multiple deployments (cloud, self-hosted, work). `~/.config/agent0/config.json` shape: `{ active: "default", profiles: { default: { url, token, workspace_id } } }`. Global flag `--profile <name>` and `AGENT0_PROFILE` env var override the active profile. `agent0 use <profile>` switches the default.

---

## Architecture overview

```
+--------------------+   PAT (user-bound) /     +-----------------------+
|  agent0 CLI        |   x-api-key (machines)   |  apps/runner          |
|  (packages/cli)    |  ----------------------> |  Fastify + Supabase   |
+--------------------+  /api/v1/workspaces/:id  +-----------------------+
        ^                  /…  (HTTPS+JSON)                |
        | reads/writes ~/.config/agent0/config.json        v
        |  { active, profiles: { name: { url,        +----------------+
        |     token, workspace_id } } }              |   Supabase     |
+--------------------+                               +----------------+
|  AI tool (Claude   |  shells out to `agent0`
|  Code, Cursor, …)  |  + reads installed skill
+--------------------+
```

- Frontend continues to talk directly to Supabase. The CLI never touches Supabase directly — it goes through `/api/v1/*`, which means we're forced to design clean, scope-checked endpoints that any third party can use.
- The "prompt" itself is the opaque JSON in `agent_versions.data`. The API treats it as a blob; only the runner interprets it. CLI pulls it to a file, AI edits the file, CLI pushes it back as a new version.
- **Auth dispatch:** the middleware checks `Authorization: Bearer …` first (PAT). If absent, falls back to `x-api-key`. The workspace comes from the URL path (`/api/v1/workspaces/:workspaceId/…`), not from the credential. For a PAT, the middleware re-resolves the user's `workspace_user.role` against the path's workspaceId on every request (revoke a user from a workspace → their PAT loses access there immediately). For an API key, the middleware 403s if the path's workspaceId doesn't match the key's pinned workspace. PAT path sets `request.userId` and grants scopes derived from the user's role; API-key path leaves `userId` unset and uses the explicit scope list. Routes that mutate state chain a second preHandler — `requireUserId` — which 403s when the caller is an API key. Identity/discovery routes (`/me`, `/workspaces`, `/auth/logout`, `/version`) live outside the workspaced prefix.

---

## New scopes

Existing scope model (`apps/runner/src/lib/scopes.ts`): three segments, `resource:action:id`, `*` wildcard per segment.

**Already in use:** `agents:read:*`, `agents:read:<id>`, `agents:run:*`, `agents:run:<id>`, `runs:read:*`.

**Scopes added by Phase 1 tasks** (each one introduced alongside the endpoint that needs it, plus a suggestion added to the dashboard key-creation form):

| Scope | Used by | Task |
|---|---|---|
| `tags:read:*` | `GET /api/v1/workspaces/:workspaceId/tags` | T1.4 |
| `providers:read:*` | `GET /api/v1/workspaces/:workspaceId/providers` | T1.5 |
| `mcps:read:*` | `GET /api/v1/workspaces/:workspaceId/mcps` | T1.6 |

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

> **Correction note (2026-05-27):** T0.1/T0.2 shipped with two design mistakes — PATs were tied to a single workspace, and there was no story for capturing the agent0 base URL from the CLI (the runner is open-source and self-hostable). T0.3–T0.5 below correct the model **before** Phase 1's write endpoints land. After this, T1.* paths shift to `/api/v1/workspaces/:workspaceId/...`.

- [x] **T0.3 — Move all resource routes under `/api/v1/workspaces/:workspaceId/...`.**
  - **Affected existing routes** (these are the ones already shipped that need to move):
    - `POST /api/v1/run` → `POST /api/v1/workspaces/:workspaceId/runs`
    - `GET /api/v1/runs`, `GET /api/v1/runs/:runId` → `/api/v1/workspaces/:workspaceId/runs[/...]`
    - `GET /api/v1/agents`, `GET /api/v1/agents/:agentId`, `POST /api/v1/agents`, version subroutes → `/api/v1/workspaces/:workspaceId/agents[/...]`
    - `POST /api/v1/embed`, `POST /api/v1/embed-many` → `/api/v1/workspaces/:workspaceId/embed[-many]`
  - **Unchanged (kept unscoped):** `GET /api/v1/me`, `POST /api/v1/auth/logout`, `GET /api/v1/version` (T0.5), `GET /api/v1/workspaces` (T0.5).
  - **API-key matching guard:** add it to the dual-auth middleware — `pathWorkspaceId !== apiKey.workspace_id` → 403 with `{ message: "API key is not scoped to this workspace" }`.
  - **Breaking change for existing API-key consumers.** This is a hard cut: the old paths are removed, not aliased. Justification — the API surface isn't widely consumed yet (no published OpenAPI spec, no CLI shipped, no SDK using these routes), and dual paths would double the maintenance surface. **Open question for review: do we want a one-release deprecation window with the legacy paths emitting `Sunset` / `Deprecation` headers, or a clean break?**

- [x] **T0.4 — Detach PATs from workspaces (user-bound tokens).** (9d56e0a + c0871c1)
  - **Migration**: drop `workspace_id` column from `personal_access_tokens` along with its FK, its index, and the workspace-related half of the INSERT RLS check. New INSERT RLS: `user_id = auth.uid()`. Migration also drops the `(workspace_id, user_id)` composite index if present.
  - **Auth middleware** (`apps/runner/src/lib/auth.ts`): PAT branch no longer reads `workspace_id` off the token row. It reads the workspaceId from the route's `:workspaceId` path param (Fastify exposes it on `request.params`, now populated by T0.3). Then runs the existing `workspace_user` lookup with `(pat.user_id, pathWorkspaceId)`. 403 if the user isn't a member. Unscoped routes (identity/discovery) skip the workspace check.
  - **Dashboard**: move the tokens page from `/_app/workspace/$workspaceId/personal-access-tokens.*` to an account-level path (`/_app/account/personal-access-tokens.*`). Drop `workspace_id` from the insert in the mint form (`apps/web/src/routes/_app.workspace.$workspaceId.personal-access-tokens.$tokenId.tsx:78`). Drop the `workspace_id` filter from `personalAccessTokensQuery` (`apps/web/src/lib/queries.ts:236-253`). Move the sidebar entry to the user/account menu.
  - **`/api/v1/me`**: drop `workspace_id`, `workspace_name` from the response (those become per-request, supplied by the URL path on other endpoints). New shape: `{ user_id, user_email, user_name, token_id }`. The CLI calls `/api/v1/workspaces` separately (T0.5) to learn what workspaces the user can act in.

- [x] **T0.5 — Discovery endpoints: `GET /api/v1/workspaces` + `GET /api/v1/version`.**
  - **`GET /api/v1/workspaces`** (PAT-only, chains `requireUserId`): returns `{ data: Array<{ id, name, role, created_at }> }` listing every workspace the calling user is a member of. Powers `agent0 login`'s workspace-picker prompt and `agent0 workspaces list`.
  - **`GET /api/v1/version`** (unauthenticated): returns `{ name: "agent0", version: <package.json version>, api: "v1" }`. Lets `agent0 login` distinguish "wrong URL" (404, non-JSON, missing `name`) from "wrong token" (401 on a subsequent authed call). Cheap, ~10 lines.
  - Neither endpoint is workspace-scoped; both live at the top of `/api/v1/...`.

### Phase 1 — Backend write endpoints (one PR each)

> All routes in this phase live under `/api/v1/workspaces/:workspaceId/...` (see T0.4). `request.workspaceId` is set by the dual-auth middleware from the path param.

- [x] **T1.1 — `POST /api/v1/agents` (create agent). PAT-only.** (151fdc4) — **must move** to `POST /api/v1/workspaces/:workspaceId/agents` as part of T0.4. No behavioural changes.
  - PreHandlers: `requireScope("agents:write:*")` + `requireUserId`. (Scope gate keeps reader-role PATs out, consistent with T1.2/T1.3 and `scopesForRole`.)
  - Body: `{ name: string, tag_ids?: string[] }`. Creates an empty agent with no versions — callers push the first version separately via T1.3.
  - `name` is trimmed and rejected (400) if empty.
  - Validates that any provided `tag_ids` belong to the caller's workspace; 400 lists offending IDs.
  - Server generates the agent `id` (nanoid). Callers cannot supply one.
  - Returns the created agent (same shape as `GET .../agents/:id`), 201.
  - Reference mutation: `apps/web/src/routes/_app.workspace.$workspaceId.agents.$agentId/hooks/use-agent-mutations.tsx:25-66`.

- [x] **T1.2 — `PATCH /api/v1/workspaces/:workspaceId/agents/:id` (rename / tags / deploy). PAT-only.**
  - PreHandlers: `checkScope(agents:write:<id>)` inline + `requireUserId`. (Scope check is mostly redundant for PATs which hold `*:*:*`, but keeps the audit-friendly per-id scope language.)
  - Body: any subset of `{ name?, staging_version_id?, production_version_id?, tag_ids? }`.
  - Validate that any `version_id` being assigned belongs to this agent.
  - If `tag_ids` is present, replace the agent's tag set (delete + insert, matching `use-agent-mutations.tsx:164-183`).
  - Returns the updated agent.

- [x] **T1.3 — `POST /api/v1/workspaces/:workspaceId/agents/:id/versions` (push new prompt version). PAT-only.**
  - PreHandlers: `checkScope(agents:write:<id>)` inline + `requireUserId`.
  - Body: `{ data: object }` — opaque JSON, stored as-is.
  - Optional query: `?deploy=staging|production` — if set, also updates the corresponding `*_version_id` on the agent in the same response.
  - Sets `user_id = request.userId` (guaranteed present because of `requireUserId`).
  - Returns the created version (same shape as `GET .../agents/:id/versions/:versionId`).
  - This is the headline endpoint for the CLI `prompt push` flow.

- [ ] **T1.4 — Tags CRUD under `/api/v1/workspaces/:workspaceId/tags`.**
  - `GET .../tags`: scope `tags:read:*`. API keys allowed.
  - `POST .../tags`, `DELETE .../tags/:id`: PAT-only (`requireUserId`). No new scope needed — PATs hold `*:*:*`.
  - Tag fields: `id`, `name`, `color`, `workspace_id`.
  - DELETE cascades on `agent_tags` (verify the FK already does this; otherwise delete manually first).
  - Adds `tags:read:*` as a suggestion in the dashboard key-creation form.

- [ ] **T1.5 — `GET /api/v1/workspaces/:workspaceId/providers`.**
  - Scope: `providers:read:*`. Read-only; API keys allowed.
  - Returns `id, name, type, created_at, updated_at, has_staging_config`. **Never** returns the encrypted blobs.
  - Mirrors `apps/web/src/lib/queries.ts:22-42`.
  - Adds `providers:read:*` as a suggestion in the dashboard key-creation form.

- [ ] **T1.6 — `GET /api/v1/workspaces/:workspaceId/mcps` + `POST /api/v1/workspaces/:workspaceId/mcps/:id/refresh`.**
  - GET: scope `mcps:read:*`. API keys allowed.
  - Refresh: PAT-only (`requireUserId`). No new scope needed.
  - List response mirrors `queries.ts:44-64` (no encrypted blobs).
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
  - Own HTTP client — does **not** depend on `packages/agent0` (the SDK stays thin). Client takes `(url, token, workspace_id)` and prefixes every resource request with `/api/v1/workspaces/${workspace_id}`. Identity calls (`/me`, `/workspaces`, `/auth/logout`, `/version`) skip the prefix.
  - **Profile-based config loader.** Reads `~/.config/agent0/config.json` (mode 0600). Shape:
    ```jsonc
    {
      "active": "default",
      "profiles": {
        "default":  { "url": "https://…", "token": "agent0_pat_…", "workspace_id": "ws_…" },
        "selfhost": { "url": "https://agent0.acme.internal", "token": "…", "workspace_id": "…" }
      }
    }
    ```
  - **Resolution order** for each field: explicit flag (`--profile`, `--url`, `--workspace`) → env (`AGENT0_PROFILE`, `AGENT0_URL`, `AGENT0_TOKEN`, `AGENT0_WORKSPACE`) → active profile in config.
  - **Global flags**: `--json` (default true for read commands), `--profile <name>`, `--url <https://…>` (one-shot override), `--workspace <id>` (one-shot override).
  - **No defaults baked in.** There is no default `https://agent0.…` host — this is open source and self-hostable. `agent0` with no config errors with a hint to run `agent0 login`.

- [ ] **T3.2 — `agent0 login` + `agent0 whoami` + `agent0 logout` + `agent0 use` + workspace switch.**
  - `login [--profile <name>] [--url <https://…>]`:
    1. Prompts for the agent0 base URL if not passed (or env-supplied). Trims trailing `/`.
    2. Calls `GET <url>/api/v1/version` to confirm the URL points at agent0; errors clearly otherwise (handles 404, non-JSON, missing `name: "agent0"`).
    3. Prompts for a token (PAT or API key — distinguished by prefix `agent0_pat_…`).
    4. For PATs: calls `GET /api/v1/me` to confirm token validity, then `GET /api/v1/workspaces` and presents the list for the user to pick one. For API keys: skips the picker; calls `GET /api/v1/workspaces/${workspace_id}/agents?limit=1` against a workspace inferred by trial — actually, since API-key requests now need a workspace in the path and the key is pinned, prompt the user to enter `workspace_id` manually (machine identities know what they're for).
    5. Writes `{ url, token, workspace_id }` to the named profile (default: `default`). Sets `active` to that profile if it's new.
  - `whoami`: calls `/api/v1/me`, prints `user_email`, the active workspace name (from a follow-up `/api/v1/workspaces` call), the profile name, and the URL. Errors clearly if the stored credential is an API key (since API keys can't call `/me`).
  - `logout [--profile <name>]`: calls `POST /api/v1/auth/logout` (best-effort — for API keys this 403s and is ignored) and removes the named profile from config. If the removed profile was `active`, picks another or leaves `active: null`.
  - `use <profile>`: switches the active profile.
  - `workspaces list`: prints workspaces the current PAT can see (`GET /api/v1/workspaces`).
  - `workspace use <id>`: validates membership (call `/api/v1/workspaces`, verify `id` is present) and updates `workspace_id` on the active profile.

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
