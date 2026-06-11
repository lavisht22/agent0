# Bundled compose (future work)

The default [`docker-compose.yml`](../docker-compose.yml) is **app-only**: it runs
just the agent0 server and expects you to bring your own Postgres and S3-compatible
store. That covers the common self-host case (managed DB + object store) and is what
we deploy today.

This note captures the design for a second, **all-in-one** compose file —
`docker-compose.bundled.yml` — that ships Postgres and MinIO alongside the app for
people who want a single `docker compose up` with zero external dependencies. It is
not built yet; this is the spec for when we pick it up.

## Why a separate file (not profiles)

Docker Compose `profiles:` would let one file conditionally start the extra
services, but **Coolify does not honour profiles** when it preprocesses compose
files (see Coolify issue [#6395](https://github.com/coollabsio/coolify/issues/6395)).
Since smooth Coolify deployment is a goal, we use **two separate files** instead:

- `docker-compose.yml` — app only (default, Coolify-friendly).
- `docker-compose.bundled.yml` — app + Postgres + MinIO.

## What the bundled file needs

### 1. Services
- **postgres** — official `postgres` image, named volume for data, healthcheck,
  internal-only (no published port needed).
- **minio** — `minio/minio`, named volume, console optional, internal-only.
- **createbucket** — short-lived init container (`minio/mc`) that waits for MinIO
  and creates the `S3_BUCKET` so the app doesn't 500 on first write.
- **agent0** — same image as the app-only file, `depends_on` postgres + minio
  (with `condition: service_healthy`).

### 2. The SSL blocker (must solve before this works)
The runner hardcodes `ssl: "require"` in **two** places:
- `apps/runner/src/lib/pg.ts`
- `packages/database/migrate.ts`

A bundled local Postgres speaks **plaintext on the internal Docker network**, so
`ssl: "require"` will fail the connection. Make SSL configurable before shipping the
bundled file. Options, simplest first:
- Honour `sslmode=disable` in the `DATABASE_URL` query string, or
- Add a `DATABASE_SSL` env (`require` default, `disable` for bundled), threaded into
  both `postgres()` calls.

Keep `require` as the default so the app-only path (Supabase, managed DBs) is
unchanged.

### 3. Bundled env defaults
The bundled file should pre-wire the internal endpoints so the user only fills in the
true secrets:
- `DATABASE_URL=postgres://agent0:<pw>@postgres:5432/agent0?sslmode=disable`
- `S3_ENDPOINT=http://minio:9000`, `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` matching
  the MinIO root creds, `S3_FORCE_PATH_STYLE=true`.
- Still user-supplied: `CONFIG_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `APP_URL`,
  `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

A `.env.bundled.example` should accompany it.

### 4. Docs
Add a "Bundled (all-in-one)" subsection to the README's Self-Hosting block once the
file exists, making clear it is the zero-dependency path and the app-only file
remains the default.
