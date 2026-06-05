# Supabase → Self-Contained Database Migration

**Status:** **Phase 1 DONE** ✅ — the web app no longer makes any direct Supabase *data* access (`.from`/`.rpc`/`.storage` all gone; only auth `getSession`/`getClaims`/`signOut`/OTP remain, by design). All tables migrated onto the runner API. Two runner additions were needed for the agents cluster (`staging_model`/`production_model` on `/agents`; `DELETE /agents/:id`). Manual regression pass completed by the user (2026-06-05) — every screen works through the runner API. **Now starting Phase 2** — replace Supabase Auth with better-auth.
**Goal:** Remove agent0's hard dependency on hosted Supabase so it can be self-hosted with only components that ship in this repo — *without* moving production data until the very end. We peel off the Supabase *platform layers* (data SDK → auth → DB driver) one at a time, keeping Supabase's Postgres as the single source of truth throughout.

> Long, multi-phase migration. Each phase is independently shippable and leaves `main` working. agent0 is **in production with live data**, so the ordering below is deliberately incremental and reversible: **the data never migrates until Phase 4.** Check items off as we go; update the **Status** lines.

---

## 📌 This file is the source of truth (read first, every session)

This migration spans **many sessions**. **This markdown file is the living state of the work** — not chat history, which won't carry over.

**At the start of every session that touches this migration, Claude must read this entire file first** to reconstruct full context: the decisions made (and *why*), the current phase, what's checked off, and what's next. Do not rely on memory or assume prior-session context is present.

**Keep it current as you work.** Whenever a decision is made, a step completed, or direction changes:
- update the top-level **Status** and the per-phase **Status** lines,
- check off completed items (and add newly discovered ones),
- record/amend decisions in [Key decisions](#key-decisions) with the rationale,
- append a dated entry to the [Progress log](#progress-log) summarizing what changed and where we left off.

Treat an out-of-date plan as a bug. If reality and this file disagree, fix the file.

---

## Guiding principles

1. **Data stays put, reversible steps.** Supabase's Postgres remains the source of truth. We swap *access layers*, not rows, until the final phase. Any step can be rolled back without data loss.
2. **The Supabase SDK and a direct Postgres/Drizzle connection coexist** against the same database. Migration off the SDK happens table-by-table, not in a big bang.
3. **One principal, many credentials.** Authenticate at the edge; normalize every credential (browser session, PAT, API key) into a single `Principal`. Route handlers depend only on `principal.scopes`, never on *how* the caller authenticated. (See [Auth architecture](#auth-architecture).)
4. **RLS goes dormant, not deleted.** Once the browser stops hitting Postgres directly and the runner connects as a service role, RLS stops firing but stays in the schema as harmless defense-in-depth. No risky teardown.

---

## Background: what Supabase does for us

Four distinct platform features, each with a different switching cost:

| Feature | Where it's used | Switching cost |
|---|---|---|
| **Postgres** (the data) | everywhere | Low — it's just Postgres |
| **Auth** (`signInWithOtp`, `verifyOtp`, `getSession`, `getClaims`, `getUser`, `admin.getUserById`) | web + runner | Medium — OTP / magic-link email auth |
| **Storage** (run-log blobs in the `runs-data` bucket, keyed by `runId`) | `helpers.ts`, `runs.ts`, `queries.ts` | Low–Medium |
| **RLS** (`is_workspace_reader/writer/admin`, `auth.uid()`) | ~all tables | High — but it goes *dormant*, see principle #4 |

The center of gravity is **not** the database swap (Postgres is portable). It's that the **web app talks directly to Postgres from the browser** with the anon key (~40 `.from("table")` calls), with *all* authorization living in RLS tied to `auth.uid()`. Moving that behind the runner API — and re-implementing RLS rules in code — is the bulk of the work and the bulk of the risk.

---

## Auth architecture

### The standard we're following

Multiple credential types against one API is normal (GitHub/Stripe/GitLab). The discipline is: **authenticate → normalize to one `Principal` → authorize on the principal only.**

```ts
type Principal =
  | { kind: "user";   userId: string; workspaceId?: string; scopes: string[] }              // browser session OR PAT
  | { kind: "apiKey"; workspaceId: string; scopes: string[]; allowedOrigins: string[] | null }
```

The auth middleware is an **ordered list of authenticators** (Passport-style strategies); first one to yield a `Principal` wins. Discrimination is a clean, permanent prefix/header check (no shape-sniffing):

1. **Browser session** → `kind: "user"`. `Authorization: Bearer <session-token>` (Supabase JWT in Phase 1; better-auth **bearer-plugin session token** from Phase 2). Selected when the bearer token does **not** start with `agent0_pat_`.
2. **PAT** (`agent0_pat_…`) → `kind: "user"`. `Authorization: Bearer agent0_pat_…`. CLI; inherits the user's *current* workspace role dynamically (demote the user → their PATs weaken on next request). **Already prefixed today.** From Phase 2, lifecycle is owned by better-auth's **API Key plugin**; scopes still resolved dynamically by us (see below).
3. **API key** → `kind: "apiKey"`. `x-api-key: …`. Machine identity; workspace-pinned, fixed scopes, origin allowlist. Distinct header, so no prefix needed. Stays an agent0-owned table (workspace-bound + origin allowlist isn't better-auth's user/org model).

Route handlers read only `principal.scopes`. `kind === "user"` replaces today's `requireUserId` for mutations that must exclude machine keys. PAT and API key stay **distinct kinds** (different semantics) but produce one normalized type.

### Browser credential: bearer token in `Authorization` (decided), not cookies

The browser keeps sending `Authorization: Bearer <token>` — it already does this today with the Supabase access token. From Phase 2 the token is better-auth's **bearer-plugin session token** (opaque, DB-backed), **not** a signed JWT. Rationale:

- **Minimal churn** — Phase 1→2 only swaps the token *issuer/validator*; the transport is unchanged. No cookie/CSRF/CORS-with-credentials machinery to add or remove.
- **Uniform model** — everything is a header/bearer token across browser, CLI, and machines.
- **No CSRF surface** — `Authorization` isn't auto-sent by the browser (cookies are); and no cross-origin cookie pain in dev (:2222 ↔ :2223) or for the embed use case.
- **Discrimination stays clean** — PAT is already `agent0_pat_`-prefixed, so "session vs PAT" on the same header is an O(1) prefix check.

**Bearer-plugin session token vs JWT plugin:** better-auth's *bearer plugin* sends an opaque, DB-backed session token (instant revocation, no signing-key infra) — the right default for our stateful runner that already hits Postgres every request. better-auth's *JWT plugin* (signed JWTs verified via JWKS, no DB hit) is explicitly "not a replacement for the session" and is for stateless/external verification; keep it in reserve, only adopt if a future need for stateless verification appears.

**Tradeoff accepted:** a bearer token held in JS is exfiltratable by XSS (an httpOnly cookie wouldn't be). Mitigate with short-lived sessions + refresh, keeping the token **in memory (not localStorage)**, and a strict CSP. (See Risks.)

### Today's wiring (for reference)

- `/internal/test`, `/internal/refresh-mcp` — validate the Supabase JWT via `supabase.auth.getClaims(token)`, registered **outside** `addAuth`.
- `/api/v1/workspaces/:workspaceId/*` — go through `addAuth`, which only knows **PAT** (`Bearer`, hashed → `personal_access_tokens`) and **API key** (`x-api-key`). The web app does **not** use these yet.

---

## Inventory (surface area)

### Tables (12)
`agents`, `agent_versions`, `agent_tags`, `tags`, `mcps`, `providers`, `runs`, `api_keys`, `personal_access_tokens`, `users`, `workspaces`, `workspace_user`

### DB functions / RPCs
- `get_dashboard_stats(p_workspace_id, p_start_date?, p_end_date?)` — web dashboard
- `get_top_agents(p_workspace_id, p_limit?, p_start_date?, p_end_date?)` — web dashboard
- `is_workspace_admin` / `is_workspace_reader` / `is_workspace_writer` — RLS helpers (logic re-implemented in runner code)
- `delete_old_runs()` — scheduled cleanup (→ D6)

### Storage
- Bucket `runs-data`: one JSON object per run (`name = runId`). Read policy gated on `is_workspace_reader`.

### Web files with direct Supabase access (→ migrate to API calls in Phase 1)
```
apps/web/src/lib/supabase.ts                     (client)
apps/web/src/lib/queries.ts                       (bulk of reads/writes + 2 RPCs + storage download)
apps/web/src/components/sidebar.tsx               (signOut)
apps/web/src/components/tags-select.tsx           (tags read)
apps/web/src/routes/auth.tsx                      (OTP sign-in)
apps/web/src/routes/_app.tsx                      (session gate, workspaces)
apps/web/src/routes/_app.create-workspace.tsx
apps/web/src/routes/_app.account.personal-access-tokens.index.tsx
apps/web/src/routes/_app.account.personal-access-tokens.$tokenId.tsx
apps/web/src/routes/_app.workspace.$workspaceId.settings.tsx
apps/web/src/routes/_app.workspace.$workspaceId.agents.index.tsx
apps/web/src/routes/_app.workspace.$workspaceId.agents.$agentId/hooks/use-agent-mutations.tsx
apps/web/src/routes/_app.workspace.$workspaceId.agents.$agentId/hooks/use-agent-runner.tsx
apps/web/src/routes/_app.workspace.$workspaceId.api-keys.index.tsx
apps/web/src/routes/_app.workspace.$workspaceId.api-keys.$apiKeyId.tsx
apps/web/src/routes/_app.workspace.$workspaceId.mcps.index.tsx
apps/web/src/routes/_app.workspace.$workspaceId.mcps.$mcpId.tsx
apps/web/src/routes/_app.workspace.$workspaceId.providers.index.tsx
apps/web/src/routes/_app.workspace.$workspaceId.providers.$providerId.tsx
```

### Runner files using Supabase (→ migrate to Drizzle in Phase 3)
```
apps/runner/src/lib/db.ts          (Supabase client — coexists with, then replaced by, the pg/Drizzle client)
apps/runner/src/lib/auth.ts        (PAT/API-key lookups; gains browser-session resolver in Phase 1)
apps/runner/src/lib/helpers.ts     (provider decrypt reads, storage upload)
apps/runner/src/lib/run-agent.ts
apps/runner/src/routes/*.ts        (agents, auth, embed, mcps, providers, refresh-mcp, runs, tags, test, workspaces)
```

### Existing runner endpoints (the API foundation already in place)
`GET /me`, `POST /auth/logout`, `embed`/`embed-many`, `agents` CRUD + versions, `providers` (GET), `mcps` (GET + refresh), `tags` CRUD, `runs` (GET/POST), `workspaces` (GET), `version`.
**Gaps to fill in Phase 1:** full CRUD for providers, mcps, api_keys, personal_access_tokens, workspaces (create/update/members/settings), dashboard stats.

---

## Key decisions

Core stack decided. Remaining decisions are deferred to their phases.

- [x] **D1 — Target database default.** ✅ **Bundled Postgres** (docker-compose).
- [x] **D2 — Query layer.** ✅ **Drizzle** (+ Drizzle Kit migrations).
- [x] **D3 — Auth library.** ✅ **better-auth** (email OTP/magic-link). **Bearer plugin** for browser session tokens; **API Key plugin** for PAT lifecycle. We keep our own scope/role authorization (see D11).
- [x] **D5 — Migration tooling.** ✅ **Drizzle Kit**.
- [x] **D8 — Browser credential.** ✅ **Bearer token in `Authorization`** (not cookies), specifically better-auth's **bearer-plugin session token** (opaque, DB-backed, instant revocation) rather than a signed JWT. JWT plugin held in reserve for future stateless/external verification only.
- [x] **D9 — Token discrimination.** ✅ PAT prefixed `agent0_pat_` (Bearer); API key on the distinct `x-api-key` header. Browser session = any Bearer not starting with `agent0_pat_`. No further prefixing required.
- [x] **D11 — PAT ownership split.** ✅ better-auth's **API Key plugin** owns the PAT *token lifecycle* (create/verify/expire/revoke/list, hashing, `agent0_pat_` prefix). agent0 keeps *authorization* — resolve `userId → current workspace role → scopes` at request time (`scopesForRole`); ignore the key's static `permissions`. Machine **API keys stay an agent0 table** (workspace-bound + origin allowlist, not better-auth's model). Note: `last_used_at` tracking isn't documented for the plugin — keep updating it ourselves if needed.
- [x] **D7 — Email transport.** ✅ **Resend** (hosted API, simplest setup). better-auth's emailOTP `sendVerificationOTP` hook calls Resend with `RESEND_API_KEY`. (Noted tradeoff: an external dependency vs. the fully-self-hostable goal; acceptable for now, can wrap behind an interface later if a self-hoster needs SMTP.)
- [x] **D10 — `users` table ownership.** ✅ **Merge** — better-auth owns the **existing `public.users`** table. Add the columns it requires (`email` unique, `email_verified` bool, `updated_at`, `image`) via migration; **preserve existing UUIDs** (configure better-auth to generate UUIDs for new users) so `workspace_user.user_id` / `runs` / `providers` / PAT FKs stay valid. One-time backfill copies each user's email from Supabase's `auth.users` into `public.users.email` (set `email_verified = true` for existing). better-auth's new `session` / `account` / `verification` tables are additive (no conflict). **Login stays email-OTP** (better-auth **emailOTP plugin**, parity with today's 6-digit code UX).
- [ ] **D4 — Run-log storage.** DB column (`bytea`/`text`) vs filesystem vs S3-compatible (MinIO). *Leaning: filesystem behind a pluggable interface; S3 optional.* — Phase 5.
- [ ] **D6 — Scheduled jobs** (`delete_old_runs`). Postgres cron → runner-scheduled job or external scheduler. — Phase 3/5.

---

## Phased plan

> The four phases below match the agreed sequence: (1) frontend off the Supabase **data** SDK, (2) replace **auth**, (3) replace the **DB driver** with Drizzle, (4) **package** for self-hosting. Auth (2) and the Drizzle driver (3) share a foundation — see the note in Phase 2.

### Phase 1 — Frontend off the Supabase data SDK (keep Supabase auth)
**Status:** ✅ **DONE** — 1a + 1b + 1c shipped (tsc+biome clean); manual regression pass completed by the user on 2026-06-05 (every screen verified working through the runner API).
Build the missing runner APIs and route *all* web data access through them. The browser keeps using Supabase **auth** (JWT) but stops touching Postgres for **data**. Non-destructive: schema, RLS, and the Supabase SDK on the runner all stay.

**1a — Teach the runner middleware the browser-session credential** ✅ done
- [x] Define the `Principal` type and refactor `addAuth` into ordered authenticators (browser-session → PAT → API key), all yielding `Principal`. (`apps/runner/src/lib/auth.ts`)
- [x] Add the **browser JWT** authenticator (validate the Supabase access token via `getClaims`), deriving `userId` → workspace role → scopes (reuse `scopesForRole` via the shared `resolveUserScopes` helper). Selected when the Bearer token does not start with `agent0_pat_`.
- [x] **Decided: defer** folding `/internal/test` + `/internal/refresh-mcp` onto the unified middleware to **Phase 2** — they still call `getClaims` directly. Kept 1a tight and reviewable; they get swapped to better-auth verification in Phase 2 anyway (see Phase 2 task "Replace remaining runner `getClaims`").
- [x] Replace ad-hoc `requireUserId` checks with `principal.kind === "user"` (`apps/runner/src/lib/scopes.ts`). The discrete `request.userId/tokenId/scopes/allowedOrigins` decorations are still populated from the `Principal` so existing route handlers work unchanged.

> **Note for 1b/1c:** the browser-session authenticator only resolves scopes when the route has a `:workspaceId` path param. Unscoped routes (`/me`, `/auth/logout`, `/workspaces` create) get empty scopes — same as PATs today — so those handlers must gate on `principal.kind`/`userId`, not `scopes`. The machine API-key path is untouched.

**1b — Fill the runner API gaps** ✅ done (enforce scopes + re-implement the matching RLS rule per endpoint; **security review each**)
- [x] Providers: create / update / delete (GET exists). Admin-only (`providers:write:*`, matched only by admin's `*:*:*`) + `requireUserId`, mirroring the providers INSERT/UPDATE/DELETE RLS policies (`is_workspace_admin`). Config stays **client-side PGP-encrypted**; the API persists the opaque armored blobs (parity with the old direct `.from("providers")` writes), so the runner's create/update path never sees plaintext.
- [x] MCPs: create / update / delete (GET + refresh exist). Admin-only (`mcps:write:*`, matched only by admin's `*:*:*`) + `requireUserId`, mirroring the mcps INSERT/UPDATE/DELETE RLS policies (`is_workspace_admin`). Config stays **client-side PGP-encrypted** (armored blobs persisted as-is, parity with the old `.from("mcps")` writes); `tools` is populated separately via the existing refresh endpoint, not on create/update. Fixed a latent bug: the shared `McpSchema` declared `custom_headers` as `type: "object"`, but the column is `text` — corrected to `string`.
- [x] API keys: list / create / revoke (delete) / update. **All four** gate on `api_keys:write:*` + `requireUserId`. ⚠️ Subtle: the api_keys RLS was a *single* `ALL` policy on `is_workspace_admin` — so even SELECT is admin-only (the row holds the plaintext `key`). Our scope model's only admin-only shape is `*:*:*`; a `:read:` scope would be matched by readers'/writers' `*:read:*` grant and **leak the keys**, so the list endpoint uses the write scope too, porting that one `ALL` policy. Keys are now **minted server-side** (same alphabet/length as the old client-side `customAlphabet`) instead of trusting a client-supplied value — no weak browser RNG, no untrusted round-trip; the create response returns the new key. `key`/`user_id`/`workspace_id` are immutable on update (only name/scopes/allowed_origins editable); empty origin list → `null` (parity). New file `apps/runner/src/routes/api-keys.ts`, registered in the workspace-scoped block.
- [x] Personal access tokens: list / create / revoke. New `apps/runner/src/routes/personal-access-tokens.ts`, registered **outside** the `:workspaceId` prefix (PATs are user-bound, not workspace-bound — RLS gated every op on `user_id = auth.uid()` only). All gate on `requireUserId` (no scope — there's no workspace to scope to; admits browser sessions + PATs, blocks machine api-keys). ⚠️ The runner uses the service role and **bypasses RLS**, so the `user_id = auth.uid()` ownership rule is re-implemented in code: every query filters `.eq("user_id", request.userId)`. List returns only safe columns (**never `token_hash`**) and filters `revoked_at IS NULL`; create mints server-side (`agent0_pat_` + 32-char alphabet, identical format to the old client gen) and returns the raw token once (+ persists only its sha256 hash and a display prefix); revoke is a **soft delete** (sets `revoked_at`, matching the web + `/auth/logout`), scoped to the caller's own tokens. Coexists with the existing `/me` (identity of calling token) and `/auth/logout` (revoke self) — no overlap.
- [x] Workspaces: create / update (rename) / delete / members list / member remove (leave) / member role. Added to `apps/runner/src/routes/workspaces.ts`. **create**: `requireUserId`, sets `user_id` explicitly (the column defaults to `auth.uid()` = null under the service role) — the `workspace_assign_owner_admin` AFTER INSERT trigger still fires and seeds the creator's admin membership. **update/delete**: `requireUserId` + `requireAdminOrOwner`, porting the RLS `is_workspace_admin(id,uid) OR uid = user_id` (admin via the `*:*:*`-only `workspaces:write:*` scope; owner via an explicit `workspaces.user_id` read — the escape hatch so a demoted owner isn't locked out). **members list**: `members:read:*` (held by every role via `*:read:*`, matching the `is_workspace_reader` SELECT) + `requireUserId` to keep member names away from machine keys. **member remove/leave**: `requireUserId` + admin-OR-self, porting `is_workspace_admin OR uid = user_id`. **member role change**: ⚠️ **admin-only** — deliberately does *not* port the RLS `OR uid = user_id` self-clause, which on a `role` UPDATE is a privilege-escalation footgun (a reader could self-promote to admin); the web has no self-role path so this is a safe tightening. ⚠️ **member ADD deferred**: no invite/email infrastructure exists yet (the web "Add" button is an unimplemented stub; CLAUDE.md's `/api/v1/invite` is not present in the runner) — tracked separately.
- [x] Dashboard: `GET …/dashboard/stats` + `…/dashboard/top-agents`. New `apps/runner/src/routes/dashboard.ts`, gated `runs:read:*` (any member; it's run analytics). **Proxies** the existing Postgres RPCs (`get_dashboard_stats`, `get_top_agents`) via `supabase.rpc(...)` rather than re-aggregating in JS — they aggregate DB-side without the 1000-row cap, and translating them to Drizzle SQL belongs in Phase 3. Returns the RPCs' native snake_case under `data`; optional `start_date`/`end_date` (+ `limit` for top-agents) query params map to the RPCs' `p_*` args (omitted → SQL `NULL` default).
- [x] Runs: confirmed list/get + log-download coverage. The run-log blob is already returned inline as `run_data` by `GET /runs/:runId` (covers the web's separate `runDataQuery` storage download). **Found + fixed two list gaps:** (1) added a `parent_run_id` filter so the web's `childRunsQuery` (agent-as-tool children) is covered; (2) the list used `agent_versions!inner` unconditionally, which dropped runs with null `version_id` (unsaved/deleted agents) that the web's default list shows — switched to a **left join by default, inner only when filtering by `agent_id`** (exactly the web's strategy; filtering an embedded column needs the inner hint), and marked `agent` nullable.
- [x] Tags: confirmed CRUD coverage. Web uses only tags **read** (`GET /tags`) + **create** (`POST /tags`); `DELETE /tags/:id` also exists (unused by web). No tag update/delete in the web. `agent_tags` (agent↔tag links) is part of the agent-versioning flow, handled by the agents routes — out of scope for the `tags` item.

**1c — Migrate the web app to the API** (table-by-table; remove direct `.from`/`.rpc`/`.storage`)
- [x] Typed web API client (`apps/web/src/lib/api-client.ts`) — `api.get/post/patch/delete<T>`, attaches the Supabase JWT (Phase 2 swaps the one `getSession` line for a better-auth bearer token), dev/prod base URL, throws typed `ApiError` (carries `status`, reads the runner's `{ message }`), query-param + `204` handling.
- [x] `queries.ts`: all tables migrated — workspaces · workspace_user · agents · agent_versions · agent_tags · tags · providers · mcps · runs (+log download) · api_keys · personal_access_tokens · users (folded into members) · dashboard RPCs.
- [x] Per-route direct calls — done for every inventory file (the agents cluster required two runner additions: `staging_model`/`production_model` summaries on `/agents`, and a missing `DELETE /agents/:id`).
- [x] Confirm the browser no longer holds the anon key for data — verified by grep: the only remaining `supabase.*` calls are auth (`getSession`/`getClaims`/`signOut`/`signInWithOtp`/`verifyOtp`); no `.from`/`.rpc`/`.storage` data access remains.
- [x] Regression pass: every screen works through the API — done by the user 2026-06-05.

✅ **Exit:** browser reads/writes go only through the runner; Supabase used by the browser for **auth only**. RLS now dormant for app traffic (kept as backstop).

### Phase 2 — Replace Supabase Auth with better-auth
**Status:** Decisions resolved (D7 = Resend, D10 = merge into `public.users`, login = email-OTP); implementation not started.
Swap email-OTP auth for better-auth, migrate identities, move PAT lifecycle onto better-auth, and switch the browser token's issuer from Supabase to better-auth (same `Authorization: Bearer` transport).

> **Shared-foundation note:** better-auth has **no Supabase-SDK adapter** — it needs a direct Postgres connection (Drizzle/`pg`). So this phase **introduces the Drizzle/`pg` connection pointed at the *same* Supabase Postgres**, and better-auth is its first consumer. The rest of the runner keeps using the Supabase SDK until Phase 3. (Pooler caveat: if connecting via Supabase's transaction-mode pooler, disable prepared statements — `postgres.js prepare:false` — or use the direct/session connection.)

> **Key finding (from Phase 2 scoping):** `public.users` today is `{ id, name, created_at }` — **email is NOT here**, it lives in Supabase's `auth.users`. So Phase 2 must make better-auth the system of record for email/identity, not just tokens. Per **D10** we merge: better-auth owns `public.users`, extended with the columns it needs, UUIDs preserved.

**Suggested implementation order** (each step keeps `main` working):
- [ ] **0. Prereqs:** Resend API key (`RESEND_API_KEY`, ✅ have it) + verified sender domain; **Session pooler** Postgres connection string (port 5432, IPv4 + prepared statements; direct only if host is IPv6-capable; NOT the 6543 transaction pooler) in `DATABASE_URL`. Add both to `.env.example`.
- [x] **1. Schema migration FIRST** (columns before Drizzle/better-auth — cleaner, isolated, reversible). Written: `20260605120000_users_auth_columns.sql`. On `public.users`: add `email` (nullable→backfill→NOT NULL + unique index), `email_verified` (bool default false), `updated_at` (default now()), `image` (nullable). **Backfill** `email` from `auth.users` by id, `email_verified = true` for all existing rows. **Drops** the `auth.users → public.users` `insert_user()` trigger + function (decision: no further Supabase-Auth signups — all new accounts come through the better-auth flow, which writes `public.users` directly). better-auth's own `session`/`account`/`verification` tables are NOT created here — generated from better-auth's CLI in step 3. **✅ Pushed to prod 2026-06-05** (`db push` + `types` regenerated; `users` Row now carries email/email_verified/image/updated_at; runner + web typecheck clean; only `users` access in source is a `select`, no inserts broke).
- [ ] **2. DB connection:** stand up the Drizzle/`pg` (`postgres.js`) connection in the runner (coexists with the Supabase SDK). New `apps/runner/src/lib/pg.ts` or similar.
- [ ] **3. Configure better-auth** on the pg connection: **emailOTP plugin** (`sendVerificationOTP` → Resend), **bearer plugin** (opaque DB-backed session token in `Authorization`), **API Key plugin** (PATs, `agent0_pat_` prefix). Map the user model to table `users`; configure **UUID generation** for new users (`advanced.database.generateId`) so ids match the existing scheme.
- [ ] **4. Backfill identities preserving UUIDs:** copy each user's email from `auth.users` → `public.users.email`, set `email_verified = true` for existing rows. Passwordless, so only emails + ids move (no password hashes). Verify FK integrity (`workspace_user.user_id`, `runs`, `providers`, PATs).
- [ ] **5. Migrate PATs onto the API Key plugin** (per **D11**): import existing `agent0_pat_` tokens into better-auth's key store (or re-issue); keep our dynamic scope resolution (`scopesForRole`); preserve `last_used_at` if the plugin doesn't track it. Verify the CLI (`packages/cli`) still authenticates unchanged.
- [ ] **6. Runner middleware swap:** browser authenticator's validator `getClaims` → **better-auth session verification**; PAT authenticator's lookup → **`auth.api.verifyApiKey`** (then `scopesForRole`). Transport + route handlers unchanged; machine API-key path untouched. Mount better-auth's handler routes.
- [ ] **7. Replace remaining `getClaims`** (`test.ts:26`, `refresh-mcp.ts:38`) and **`admin.getUserById`** (`routes/auth.ts:47`) — fold onto better-auth + the new `users.email` column (the deferred 1a cleanup).
- [ ] **8. Web:** rebuild `auth.tsx` (emailOTP send/verify), swap the `getSession` line in `api-client.ts` for better-auth's bearer token, token storage **in memory (not localStorage)**, route guards (`_app.tsx`, `sidebar.tsx` signOut).
- [ ] **9. XSS mitigations (D8):** short-lived sessions + refresh rotation + strict CSP.
- [ ] **10. Remove `@supabase/supabase-js` from the web app.**

✅ **Exit:** no Supabase Auth anywhere; browser uses better-auth bearer session tokens and PATs use the API Key plugin, all over the same `Authorization` transport; one clean credential-resolution path. (Everyone re-logs-in once at cutover — communicate it.)

### Phase 3 — Replace the DB driver: Supabase SDK → Drizzle (same DB)
**Status:** Not started
Migrate the runner's remaining data access from the Supabase SDK to the Drizzle connection introduced in Phase 2. Still the same Supabase Postgres.

- [ ] Translate all 12 tables into Drizzle schema; port indexes.
- [ ] Make `@repo/database` export the Drizzle schema/types; keep its public contract stable for consumers (web, runner, cli).
- [ ] Migrate runner reads/writes table-by-table off `supabase.from(...)`:
  - [ ] auth lookups (`lib/auth.ts`: PAT, API key, membership)
  - [ ] agents / versions / tags · providers (+decrypt reads in `helpers.ts`) · mcps · runs · workspaces · users
  - [ ] dashboard queries (the two ported RPCs)
- [ ] Adopt **Drizzle Kit** migrations; reconcile against the live Supabase schema (introspect → baseline). Stop using the `supabase` CLI for migrations.
- [ ] Port `delete_old_runs` to a runner job (**D6**).
- [ ] Remove the Supabase SDK from the **runner**; delete the SDK path in `lib/db.ts`.
- [ ] **Collapse the legacy auth decorations onto `request.principal`** (cleanup from 1a). `addAuth` currently sets `request.principal` *and* still populates the discrete `userId`/`tokenId`/`scopes`/`allowedOrigins` decorations as a transitional shim so route handlers didn't have to change in 1a. Fold them away now (Phase 3 already rewrites these handlers' data access, so this rides along): point the `scopes.ts` helpers (`requireScope`/`checkScope`/`hasScope`) at `request.principal.scopes`; switch the ~5 handler reads of `request.userId`/`tokenId` (`workspaces.ts:51`, `auth.ts:42/43/90`, `agents.ts:763`) to `request.principal`; drop the remaining `decorateRequest` calls and the extra `FastifyRequest` fields. (The `request.allowedOrigins` decoration was already removed in the 1a PR — it was write-only; origin enforcement lives inside `authenticateApiKey` and the allowlist remains on `Principal.apiKey`.)

✅ **Exit:** all app data access via Drizzle over a plain Postgres connection string. Supabase is now just "a Postgres host." Storage (Phase 5) may still use the bucket.

### Phase 4 — Move the data + self-host packaging
**Status:** Not started
Only now is moving the actual rows on the table. Bundle Postgres and make self-hosting turnkey.

- [ ] `docker-compose.yml`: Postgres + runner + web (+ optional MinIO/SMTP).
- [ ] One-time data migration: `pg_dump` from Supabase → bundled Postgres (schema already Drizzle-managed).
- [ ] Repoint `DATABASE_URL` to the bundled instance; verify against a clone.
- [ ] Remove `SUPABASE_URL` / `SUPABASE_API_KEY` / `VITE_PUBLIC_SUPABASE_*`; update `.env.example`.
- [ ] Decommission the `packages/database/supabase/` dir + `.temp` after parity is confirmed.
- [ ] README: full self-host quickstart (`git clone && docker compose up`).
- [ ] Update `CLAUDE.md` architecture section (Supabase → Postgres + Drizzle + better-auth).
- [ ] Smoke test a clean clone on a fresh machine/container.

### Phase 5 — Replace Supabase Storage (run logs)  *(can run after Phase 3, parallel to Phase 4)*
**Status:** Not started
- [ ] Resolve **D4**.
- [ ] Storage interface (put/get/delete by `runId`) over the chosen backend.
- [ ] Runner write path (`helpers.ts`) and read paths (`runs.ts`, web via API) → new store.
- [ ] Backfill existing blobs from the `runs-data` bucket (one-time export).
- [ ] Drop the storage bucket dependency + its RLS policy.

---

## Risks & notes

- **Authz parity is the #1 risk.** RLS is declarative + Postgres-enforced; moving it into runner code per-endpoint must replicate `is_workspace_reader/writer/admin` exactly. Dedicated security review after Phase 1b/1c and after Phase 2's middleware swap.
- **Browser bearer-token XSS exposure** (D8 tradeoff) — a bearer token in JS can be exfiltrated by XSS. Required mitigations: short-lived sessions + refresh rotation, token held **in memory (not localStorage)**, strict CSP. This is the price of not using httpOnly cookies; treat the mitigations as non-optional.
- **UUID preservation** (D10) is the correctness lynchpin of the auth migration.
- **Re-login at auth cutover** — all sessions invalidate in Phase 2; communicate to users.
- **Pooler/prepared-statement caveat** when connecting through Supabase's transaction pooler (Phase 2/3).
- **Email delivery** (D7) becomes our responsibility in Phase 2.
- **CLI** (`packages/cli`) talks to the runner API, not Supabase — largely unaffected, but re-verify after Phase 2 (token prefixes/auth) and Phase 3.
- **`@repo/database` contract**: keep its export shape stable across the SDK→Drizzle swap to limit churn in web/runner/cli.

---

## Progress log

_Append dated entries as phases complete._

- **2026-06-05 — Phase 1 DONE + Phase 2 scoped & decisions resolved.** User completed the manual regression pass — every screen (incl. the intricate agent create/edit/save/deploy/version-switch/tags loop) verified working through the runner API. Phase 1 closed out; the browser now talks to Supabase for **auth only**, RLS dormant for app traffic. **Phase 2 scoping done:** confirmed no `pg`/`drizzle`/`better-auth` deps exist yet; the 3 remaining runner `getClaims` sites (`auth.ts:101`, `refresh-mcp.ts:38`, `test.ts:26`) + `admin.getUserById` (`auth.ts:47`) catalogued. **Critical finding:** `public.users` is only `{ id, name, created_at }` — **email lives in Supabase `auth.users`, not our table** — so better-auth must become the email/identity system of record. **Decisions:** D7 = **Resend**; D10 = **merge into `public.users`** (extend with email/email_verified/updated_at/image, preserve UUIDs, backfill email from `auth.users`); login stays **email-OTP** (emailOTP plugin, UX parity). Wrote a 10-step implementation order into the Phase 2 section. Connection-string decision: **session pooler** (port 5432, IPv4 + prepared statements) in `DATABASE_URL`. **Step 1 DONE + pushed to prod:** `20260605120000_users_auth_columns.sql` — extended `public.users` (email/email_verified/updated_at/image), backfilled email from `auth.users`, dropped the `insert_user()` trigger+function (decision: no more Supabase-Auth signups). Types regenerated; runner+web typecheck clean. ⚠️ Window note: nothing creates `public.users` rows until better-auth is live (step 3). **Next:** step 2 — stand up the Drizzle/`pg` (postgres.js) connection in the runner, coexisting with the Supabase SDK.
- **2026-06-04 — Phase 1c CODE-COMPLETE: agents cluster migrated; web fully off direct Supabase data.** Final table. Web side: `agentsQuery`/`agentQuery`/`agentsLiteQuery`/`agentVersionsQuery` → runner; new `agentVersionQuery` (single version w/ data); agent mutations (`createAgent`+`createAgentVersion`, `updateAgent` for rename/deploy/tags, `deleteAgent`) replace the direct inserts/updates. **Runner additions required (decision: "embed model summary"):** `GET /agents` (+ detail/patch) now return `staging_model`/`production_model` = `{provider_id, name} | null` derived server-side from the deployed versions' data (via `extractModel`, mirroring the web), plus tag `color` in the embed; and a brand-new `DELETE /agents/:agentId` (gated `agents:write:<id>`+`requireUserId`, workspace-scoped) since the web deletes agents but no endpoint existed. **Editor data-flow change:** the versions *list* is lightweight (no prompt data), so the editor now tracks a `versionId` and fetches the selected version's full `data` on demand via `agentVersionQuery` to populate the form — `version` state became `versionId` across `index.tsx`, `Action`, `useAgentRunner`, `VersionHistory`. `agentTagsQuery` deleted; selected tags derive from `agent.tags`, and the tag-sync optimistic update moved onto the `["agent", id]` cache. **Behavior notes/caveats:** `agentsLiteQuery` + `agentVersionsQuery` now cap at 100 (runner page max) vs. the old unbounded fetch — fine for typical workspaces. **Verified:** no `supabase.from/.rpc/.storage` remains anywhere in the web; tsc + biome clean across web and runner. **⚠️ Not yet runtime-verified** — needs a manual regression pass (esp. the agent create/edit/save/deploy/version-switch/tags loop, the most intricate path). Commits: runner agents (model summary + delete), then web agents. **With this, the whole web app reads/writes through the runner; Supabase is browser-side auth only.**
- **2026-06-04 — Phase 1c: providers, mcps, api_keys, PATs, workspaces+members, runs, dashboard all migrated.** Six commits after the tags proof-of-pattern, each tsc+biome-clean: **providers/mcps** (CRUD via the client; PGP encryption stays browser-side, only armored ciphertext crosses the wire; dropped client `updated_at`/`nanoid`); **api_keys** (key minted server-side, owner from the principal — dropped client `customAlphabet` + `getUser`); **PATs** (token minted+hashed server-side, raw secret returned once — dropped client `customAlphabet`/SubtleCrypto sha256); **workspaces+members** (`workspacesQuery` → flat per-membership list; split the nested member roster into a new `membersQuery` and repointed settings/api-keys-list/version-history; `workspaceUserQuery` keeps `getClaims` for id+email — **auth stays on Supabase** — and sources role+name from the members API; `_app` root redirect + create-workspace + settings rename/delete/remove-member wired); **runs+dashboard** (`runsQuery`/`runQuery`/`childRunsQuery`/`recentRunsQuery` → `/runs`; the runner flattens the version/agent embed to a single `agent` ref and inlines the run-log blob as `run_data`, so consumers read `run.agent?.name` and `runDataQuery` was deleted; dashboard stats/top-agents hit the runner endpoints that proxy the Postgres RPCs). **Behavior deltas noted:** runs list is now exactly 20/page (was a 21-row peek); child-runs reversed client-side to preserve call order (runner sorts desc). **Auth deliberately untouched** (getSession/getClaims/signOut/OTP) per the Phase-1 boundary. **Next/blocked:** the **agents cluster** is the only remaining direct-`.from` area, and it's blocked on a runner gap — the web agents *list* (`agentsQuery`) embeds each agent's deployed staging/production version **`data`** to show the model per row (`AgentModelCell` → `extractModel`), but the runner `GET /agents` returns only `staging_version_id`/`production_version_id`, not the version data. Closing this needs a runner-side change (embed the deployed versions' data — or a model summary — in the list/detail response), which is a 1b-style API extension, not pure wiring. Also pending in this cluster: `agentsLiteQuery` (runner `/agents` caps at limit≤100 vs. the old unbounded fetch — fine for typical workspaces, note the cap), `agentQuery`/`agentVersionsQuery`/`agentTagsQuery`, and the **agent save/deploy/version push + tag-sync mutation flow** (`use-agent-mutations`) — the most intricate, product-critical path. Surfacing for a decision before touching it.
- **2026-06-04 — Phase 1c STARTED: typed API client + tags table migrated.** New `apps/web/src/lib/api-client.ts` — the foundation the rest of 1c sits on: `api.get/post/patch/delete<T>(path, …)` thin typed `fetch` wrappers that pull the Supabase session and attach `Authorization: Bearer <jwt>` (the runner's 1a browser-session authenticator expects exactly this; **Phase 2 changes only the one `getSession` line** to a better-auth bearer token), resolve the dev (`http://localhost:2223`, cross-origin to :2222) vs prod (`""`, same-origin) base URL like the existing `internal/*` calls, and throw a typed `ApiError` (carries `status`, reads the runner's `{ message }` body with a statusText fallback) so it stays drop-in with React Query's `throw`-based error flow. Includes query-param + `204` handling for the dashboard/runs endpoints later. **First table wired through it: `tags`** (chosen as the small proof-of-pattern). `tagsQuery` → `GET …/tags`; new `createTag()` helper → `POST …/tags`; added an exported `Tag = Pick<Tables<"tags">, …>` type matching the runner's returned subset. `tags-select.tsx` now creates via `createTag()` (dropped client-side `nanoid` id gen — the runner mints the id — and the `supabase` import). **Not touched:** `agent_tags` reads (`agentTagsQuery`, the tag-filter in `agentsQuery`) — those belong to the `agents` flow, a later table. tsc clean; biome clean on touched files (pre-existing formatting errors in `api-keys.$apiKeyId.tsx` left alone). Committed `5219a00`. **Next:** continue 1c table-by-table — providers/mcps (CRUD; encryption stays client-side), then api_keys, PATs, workspaces cluster, runs, dashboard.
- **2026-06-04 — Phase 1b COMPLETE: dashboard RPCs + runs/tags coverage.** New `apps/runner/src/routes/dashboard.ts` (`GET …/dashboard/stats`, `GET …/dashboard/top-agents`), registered in the workspace-scoped block, gated `runs:read:*`. It **proxies** the existing `get_dashboard_stats` / `get_top_agents` Postgres RPCs via `supabase.rpc(...)` (DB-side aggregation, no 1000-row cap) rather than re-implementing the math in JS — porting them to Drizzle SQL is deferred to Phase 3; returns the native snake_case payload under `data`, with optional `start_date`/`end_date`/`limit` query params mapping to the `p_*` args. **Runs coverage:** log-download is already inline (`run_data` on `GET /runs/:runId`); fixed two list gaps — added a `parent_run_id` filter (covers the web's `childRunsQuery`), and changed the list join from unconditional `agent_versions!inner` to **left-by-default / inner-when-`agent_id`** so null-`version_id` runs (unsaved/deleted agents) aren't dropped, matching the web; marked `agent` nullable. **Tags coverage:** confirmed — web uses only GET+POST on `tags`; DELETE also exists; no update path; `agent_tags` is the agents flow's concern. With this, **all 1b API gaps are filled.** tsc + biome clean across new/changed files. **Next:** Phase 1c — build the typed web API client and migrate `queries.ts` + per-route direct `.from`/`.rpc`/`.storage` calls table-by-table onto the runner, then a full regression pass. (1c is the bulk of the remaining frontend risk; auth still rides Supabase JWT until Phase 2.)
- **2026-06-04 — Phase 1b: Workspaces + members CRUD landed.** Extended `apps/runner/src/routes/workspaces.ts` (kept the existing `GET /api/v1/workspaces` list) with: `POST /api/v1/workspaces` (create), `PATCH`/`DELETE /api/v1/workspaces/:workspaceId` (rename/delete), `GET …/members`, `PATCH …/members/:userId` (role), `DELETE …/members/:userId` (remove/leave). All registered at the `addAuth` scope level with full paths — the workspace-management ones carry `:workspaceId`, and scope resolution still works because the `addAuth` preHandler reads `request.params.workspaceId` (find-my-way populates params before preHandler hooks); verified no route-tree conflict with the `:workspaceId`-prefixed block (distinct child paths). **Security ports:** create sets `user_id` explicitly since the column default `auth.uid()` is null under the service role, and relies on the existing `workspace_assign_owner_admin` trigger to seed admin membership. Update/delete use a `requireAdminOrOwner` helper = `is_workspace_admin (via the *:*:*-only workspaces:write:* scope) OR workspaces.user_id == caller` (explicit owner read, porting the RLS owner escape-hatch). Members list is reader-level (`members:read:*`, matched by every role's `*:read:*`) + `requireUserId` (PII off machine keys). Member remove is admin-OR-self. **Deliberate deviation #1:** member **role change is admin-only** — porting the RLS `OR uid = user_id` self-clause to a `role` UPDATE would be self-promotion privesc; the web has no such path. **Deferred:** member **add** — no invite/email infra exists (web "Add" is a stub; no `/invite` route in the runner). tsc + biome clean; web not yet migrated (1c). **Next:** dashboard RPCs (`get_dashboard_stats`, `get_top_agents`), then confirm runs/tags coverage.
- **2026-06-04 — Phase 1b: Personal access tokens CRUD landed.** New `apps/runner/src/routes/personal-access-tokens.ts` (GET list / POST create / DELETE revoke), registered in the `addAuth` scope but **outside** the `:workspaceId` prefix — PATs are user-bound, not workspace-bound (the `workspace_id` column was dropped in migration `20260527130000`). **Security port:** RLS gated all four ops on `user_id = auth.uid()` ("manage only your own"); since the runner connects as the service role and bypasses RLS, that check is re-implemented as `.eq("user_id", request.userId)` on *every* query. Gate is `requireUserId` only (no `requireScope` — there's no workspace to resolve scopes against; it admits browser sessions + PATs and blocks machine api-keys, which is exactly who should manage tokens). List returns safe columns and **never `token_hash`**, filtering `revoked_at IS NULL` (parity with `personalAccessTokensQuery`). Create mints server-side: `agent0_pat_` + 32-char URL-safe alphabet (identical format to the web's old `customAlphabet` gen, and the prefix the auth middleware needs to route it to the PAT authenticator), persists only `sha256(token)` + a `token_prefix` display slice, and returns the raw token once. Revoke is a **soft delete** (sets `revoked_at`, like the web's revoke and the existing `/auth/logout`) filtered to the caller's own non-revoked tokens → 404 otherwise. Verified no overlap with the existing `/me` (identity of *calling* token) and `/auth/logout` (revoke *self*). tsc + biome clean; web not yet migrated (1c). **Next:** continue 1b — workspaces (create/update/members/settings).
- **2026-06-04 — Phase 1b: API keys CRUD landed.** New `apps/runner/src/routes/api-keys.ts` with GET (list) / POST (create) / PATCH (update) / DELETE (revoke), registered in the workspace-scoped block of `routes/index.ts`. **Security port — the tricky one:** the api_keys RLS was a *single* `ALL` policy gated on `is_workspace_admin`, so SELECT is admin-only too (rows hold the plaintext `key`). Our scope grammar only expresses "admin-only" via `*:*:*`; an `api_keys:read:*` gate would be satisfied by readers'/writers' `*:read:*` and leak every key — so **all four endpoints** gate on `requireScope("api_keys:write:*")` (matched only by admin's `*:*:*`) + `requireUserId`. Verified against `scopesForRole`: writer/reader grants (`*:read:*`, `agents:run:*`, `agents:write:*`, `tags:write:*`) none match `api_keys:write:*`. **Deliberate improvement over parity:** keys are now generated **server-side** via `customAlphabet("a-z0-9", 21)` (identical format to the web's old client-side gen) rather than accepting a client-supplied `key` — removes weak browser RNG and an untrusted-input path; the POST response returns the minted key (UI shows it once, and it stays readable in the admin-only list, as before). `user_id` is set from `request.userId` (the creating admin). Update is restricted to name/scopes/allowed_origins (`key`/`user_id`/`workspace_id` immutable); empty `allowed_origins` normalizes to `null` and scopes are trimmed/emptied-filtered (parity with the web's `cleaned`). DELETE is a hard delete (matches the web's `.delete()`; there's no `revoked_at` on api_keys). All mutations scope by `workspace_id`, 404 on cross-workspace/missing. tsc + biome clean; web not yet migrated (1c). **Next:** continue 1b — personal access tokens (list/create/revoke; verify against `/me`).
- **2026-06-04 — Phase 1b: MCPs CRUD landed.** Added POST/PATCH/DELETE `/mcps` to `apps/runner/src/routes/mcps.ts`, mirroring the Providers CRUD. All three gate on `requireScope("mcps:write:*")` + `requireUserId` — the write scope is matched only by admin's `*:*:*` (verified: writers have `*:read:*`/`agents:write:*`/`tags:write:*`, readers `*:read:*`; neither matches `mcps:write:*`), faithfully porting the admin-only `is_workspace_admin` INSERT/UPDATE/DELETE RLS policies; `requireUserId` blocks machine API keys. Encryption stays **in the browser**: endpoints accept the already-armored `encrypted_data_production` (required on create) and nullable `encrypted_data_staging` (null clears the staging override), plus the `custom_headers` text field — exactly the blobs the web wrote via `.from("mcps")`. `tools` is left untouched on create/update (populated by the existing `/mcps/:mcpId/refresh` endpoint, matching the web flow that refreshes after save). PATCH is partial + bumps `updated_at`; all mutations scope by `workspace_id` and 404 on cross-workspace/missing ids. GET refactored onto a shared `toMcp`/`SELECT_COLUMNS` helper. **Bug fix:** the shared `McpSchema` declared `custom_headers` as `type: "object"`, but the column is `text` — corrected to `string` (the old declaration would have corrupted the field to `{}` once the web reads via this API in 1c). tsc + biome clean; web not yet migrated (1c). **Next:** continue 1b — API keys CRUD.
- **2026-06-04 — Phase 1b: Providers CRUD landed.** Added POST/PATCH/DELETE `/providers` to `apps/runner/src/routes/providers.ts`. All three gate on `requireScope("providers:write:*")` + `requireUserId` — the write scope is matched only by admin's `*:*:*` (writers/readers don't get it), faithfully porting the admin-only `is_workspace_admin` INSERT/UPDATE/DELETE RLS policies; `requireUserId` additionally blocks machine API keys. Encryption stays **in the browser** (PGP public key, `VITE_PUBLIC_PGP_PUBLIC_KEY`): the endpoints accept the already-armored `encrypted_data_production` (required on create) and nullable `encrypted_data_staging` (null clears the staging override), exactly the blobs the web app used to write via `.from("providers")`. PATCH is partial (only provided fields updated, bumps `updated_at`); all mutations scope by `workspace_id` and 404 on cross-workspace/missing ids. GET refactored onto a shared `toProvider`/`SELECT_COLUMNS` helper. tsc + biome clean; web not yet migrated (that's 1c). **Next:** continue 1b — MCPs CRUD.
- **2026-06-04 — Phase 1, step 1a shipped.** Refactored `apps/runner/src/lib/auth.ts`: introduced the `Principal` discriminated union (`kind: "user" | "apiKey"`) and split the monolithic `addAuth` preHandler into three authenticators (browser-session → PAT → API key), each normalizing to a `Principal`. Added the **browser-session authenticator** validating the Supabase JWT via `supabase.auth.getClaims` and resolving scopes through the new shared `resolveUserScopes` helper (also used by the PAT path). Credential dispatch is an O(1) check: `Authorization: Bearer` starting with `agent0_pat_` → PAT, otherwise → browser session; `x-api-key` → API key. Verified PATs are already `agent0_pat_`-prefixed (web generates them so, CLI enforces it), so no existing PAT is misrouted. `requireUserId` now keys off `principal.kind !== "user"` (`scopes.ts`); discrete request decorations still populated for unchanged route handlers. **Deferred** folding `/internal/test` + `/internal/refresh-mcp` to Phase 2. Non-destructive: tsc clean, biome clean, no route/web changes. **Next:** Phase 1b — fill the runner API gaps (providers/mcps/api_keys/PATs/workspaces CRUD + dashboard RPCs), security-reviewing each against its RLS rule.
