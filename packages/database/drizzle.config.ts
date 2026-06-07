import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — `./schema.ts` is the single source of truth, and SQL
 * migrations are generated from it into `./drizzle`.
 *
 *   pnpm generate  → diff schema.ts against the last snapshot, emit a new
 *                    migration + meta snapshot under ./drizzle
 *   pnpm migrate   → apply pending migrations to DATABASE_URL
 *
 * `0000_*` is the baseline: the full schema as it stood when we moved off the
 * Supabase CLI. Only the `public` schema is managed; Supabase's internal
 * `auth`/`storage`/etc. schemas are out of scope.
 *
 * DATABASE_URL is the target Postgres (the Supabase session pooler on port
 * 5432 today; the bundled Postgres after Phase 4). Pass it inline when running
 * `migrate`.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./schema.ts",
	out: "./drizzle",
	schemaFilter: ["public"],
	// biome-ignore lint/style/noNonNullAssertion: required at migrate time
	dbCredentials: { url: process.env.DATABASE_URL! },
});
