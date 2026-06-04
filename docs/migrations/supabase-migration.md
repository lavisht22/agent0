# Supabase → Self-Contained Database Migration

**Status:** In progress — Phase 1, step 1a complete (runner middleware now accepts the browser-session credential)
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
- [ ] **D4 — Run-log storage.** DB column (`bytea`/`text`) vs filesystem vs S3-compatible (MinIO). *Leaning: filesystem behind a pluggable interface; S3 optional.* — Phase 5.
- [ ] **D6 — Scheduled jobs** (`delete_old_runs`). Postgres cron → runner-scheduled job or external scheduler. — Phase 3/5.
- [ ] **D7 — Email transport.** better-auth sends OTP emails but needs SMTP vs a provider (Resend/Postmark/…). — Phase 2.
- [ ] **D10 — `users` table ownership.** Does better-auth *own* `users`, or sit beside it (auth tables joined to `users` by id)? Must preserve existing UUIDs either way. — Phase 2.

---

## Phased plan

> The four phases below match the agreed sequence: (1) frontend off the Supabase **data** SDK, (2) replace **auth**, (3) replace the **DB driver** with Drizzle, (4) **package** for self-hosting. Auth (2) and the Drizzle driver (3) share a foundation — see the note in Phase 2.

### Phase 1 — Frontend off the Supabase data SDK (keep Supabase auth)
**Status:** In progress — 1a shipped; 1b/1c not started
Build the missing runner APIs and route *all* web data access through them. The browser keeps using Supabase **auth** (JWT) but stops touching Postgres for **data**. Non-destructive: schema, RLS, and the Supabase SDK on the runner all stay.

**1a — Teach the runner middleware the browser-session credential** ✅ done
- [x] Define the `Principal` type and refactor `addAuth` into ordered authenticators (browser-session → PAT → API key), all yielding `Principal`. (`apps/runner/src/lib/auth.ts`)
- [x] Add the **browser JWT** authenticator (validate the Supabase access token via `getClaims`), deriving `userId` → workspace role → scopes (reuse `scopesForRole` via the shared `resolveUserScopes` helper). Selected when the Bearer token does not start with `agent0_pat_`.
- [x] **Decided: defer** folding `/internal/test` + `/internal/refresh-mcp` onto the unified middleware to **Phase 2** — they still call `getClaims` directly. Kept 1a tight and reviewable; they get swapped to better-auth verification in Phase 2 anyway (see Phase 2 task "Replace remaining runner `getClaims`").
- [x] Replace ad-hoc `requireUserId` checks with `principal.kind === "user"` (`apps/runner/src/lib/scopes.ts`). The discrete `request.userId/tokenId/scopes/allowedOrigins` decorations are still populated from the `Principal` so existing route handlers work unchanged.

> **Note for 1b/1c:** the browser-session authenticator only resolves scopes when the route has a `:workspaceId` path param. Unscoped routes (`/me`, `/auth/logout`, `/workspaces` create) get empty scopes — same as PATs today — so those handlers must gate on `principal.kind`/`userId`, not `scopes`. The machine API-key path is untouched.

**1b — Fill the runner API gaps** (enforce scopes + re-implement the matching RLS rule per endpoint; **security review each**)
- [x] Providers: create / update / delete (GET exists). Admin-only (`providers:write:*`, matched only by admin's `*:*:*`) + `requireUserId`, mirroring the providers INSERT/UPDATE/DELETE RLS policies (`is_workspace_admin`). Config stays **client-side PGP-encrypted**; the API persists the opaque armored blobs (parity with the old direct `.from("providers")` writes), so the runner's create/update path never sees plaintext.
- [ ] MCPs: create / update / delete (GET + refresh exist)
- [ ] API keys: list / create / revoke / update
- [ ] Personal access tokens: list / create / revoke (verify vs `/me`)
- [ ] Workspaces: create / update / members (list/add/remove/role) / settings
- [ ] Dashboard: `GET …/dashboard/stats` + `…/dashboard/top-agents` (port the two RPCs)
- [ ] Runs: confirm list/get + log download cover all current web reads
- [ ] Tags: confirm CRUD coverage

**1c — Migrate the web app to the API** (table-by-table; remove direct `.from`/`.rpc`/`.storage`)
- [ ] Typed web API client (wrap fetch to runner; attach Supabase JWT for now)
- [ ] `queries.ts`: workspaces · workspace_user · agents · agent_versions · agent_tags · tags · providers · mcps · runs (+log download) · api_keys · personal_access_tokens · users · dashboard RPCs
- [ ] Per-route direct calls (all files in the inventory list)
- [ ] Confirm the browser no longer holds the anon key for data (auth client only)
- [ ] Regression pass: every screen works through the API

✅ **Exit:** browser reads/writes go only through the runner; Supabase used by the browser for **auth only**. RLS now dormant for app traffic (kept as backstop).

### Phase 2 — Replace Supabase Auth with better-auth
**Status:** Not started
Swap OTP/magic-link auth for better-auth, migrate identities, move PAT lifecycle onto better-auth, and switch the browser token's issuer from Supabase to better-auth (same `Authorization: Bearer` transport).

> **Shared-foundation note:** better-auth has **no Supabase-SDK adapter** — it needs a direct Postgres connection (Drizzle/`pg`). So this phase **introduces the Drizzle/`pg` connection pointed at the *same* Supabase Postgres**, and better-auth is its first consumer. The rest of the runner keeps using the Supabase SDK until Phase 3. (Pooler caveat: if connecting via Supabase's transaction-mode pooler, disable prepared statements — `postgres.js prepare:false` — or use the direct/session connection.)

- [ ] Resolve **D7** (email transport) and **D10** (`users` ownership).
- [ ] Stand up the Drizzle/`pg` connection to the Supabase DB (coexists with the Supabase SDK).
- [ ] Configure better-auth (email OTP/magic-link) on that connection with the **bearer plugin** (opaque session token in `Authorization`) and the **API Key plugin** (PATs, `agent0_pat_` prefix); create its tables.
- [ ] **Migrate identities preserving UUIDs** so `users.id` / `workspace_user.user_id` / `runs` FKs stay valid (passwordless → only emails + ids to move; no password hashes).
- [ ] **Migrate PATs onto the API Key plugin** (per **D11**): re-issue or import existing `agent0_pat_` tokens into better-auth's key store; keep our dynamic scope resolution; preserve `last_used_at` if the plugin doesn't. Verify the CLI (`packages/cli`) still authenticates unchanged.
- [ ] Update web login (`auth.tsx`), token storage (**in memory, not localStorage**), `getSession`/`signOut`, route guards (`_app.tsx`, `sidebar.tsx`) to use better-auth's bearer session token.
- [ ] In the runner middleware: swap the browser authenticator's *validator* from Supabase `getClaims` to **better-auth session verification**, and the PAT authenticator's lookup to **`auth.api.verifyApiKey`** (then resolve scopes via `scopesForRole`). Transport unchanged; route handlers unchanged; machine API-key path untouched.
- [ ] Replace remaining runner `getClaims` (`test.ts`, `refresh-mcp.ts`) and `admin.getUserById` (`routes/auth.ts`).
- [ ] Implement short-lived sessions + refresh + strict CSP (XSS mitigation per D8).
- [ ] Remove `@supabase/supabase-js` from the **web** app.

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

- **2026-06-04 — Phase 1b: Providers CRUD landed.** Added POST/PATCH/DELETE `/providers` to `apps/runner/src/routes/providers.ts`. All three gate on `requireScope("providers:write:*")` + `requireUserId` — the write scope is matched only by admin's `*:*:*` (writers/readers don't get it), faithfully porting the admin-only `is_workspace_admin` INSERT/UPDATE/DELETE RLS policies; `requireUserId` additionally blocks machine API keys. Encryption stays **in the browser** (PGP public key, `VITE_PUBLIC_PGP_PUBLIC_KEY`): the endpoints accept the already-armored `encrypted_data_production` (required on create) and nullable `encrypted_data_staging` (null clears the staging override), exactly the blobs the web app used to write via `.from("providers")`. PATCH is partial (only provided fields updated, bumps `updated_at`); all mutations scope by `workspace_id` and 404 on cross-workspace/missing ids. GET refactored onto a shared `toProvider`/`SELECT_COLUMNS` helper. tsc + biome clean; web not yet migrated (that's 1c). **Next:** continue 1b — MCPs CRUD.
- **2026-06-04 — Phase 1, step 1a shipped.** Refactored `apps/runner/src/lib/auth.ts`: introduced the `Principal` discriminated union (`kind: "user" | "apiKey"`) and split the monolithic `addAuth` preHandler into three authenticators (browser-session → PAT → API key), each normalizing to a `Principal`. Added the **browser-session authenticator** validating the Supabase JWT via `supabase.auth.getClaims` and resolving scopes through the new shared `resolveUserScopes` helper (also used by the PAT path). Credential dispatch is an O(1) check: `Authorization: Bearer` starting with `agent0_pat_` → PAT, otherwise → browser session; `x-api-key` → API key. Verified PATs are already `agent0_pat_`-prefixed (web generates them so, CLI enforces it), so no existing PAT is misrouted. `requireUserId` now keys off `principal.kind !== "user"` (`scopes.ts`); discrete request decorations still populated for unchanged route handlers. **Deferred** folding `/internal/test` + `/internal/refresh-mcp` to Phase 2. Non-destructive: tsc clean, biome clean, no route/web changes. **Next:** Phase 1b — fill the runner API gaps (providers/mcps/api_keys/PATs/workspaces CRUD + dashboard RPCs), security-reviewing each against its RLS rule.
