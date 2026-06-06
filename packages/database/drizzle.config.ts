import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for introspecting the live (Supabase) Postgres into a
 * Drizzle schema — Phase 3 of the Supabase -> self-contained migration.
 *
 * `pull` generates ./drizzle/{schema,relations}.ts + a baseline snapshot in
 * ./drizzle/meta. We curate the generated schema into the package's exported
 * `schema.ts`. Only the `public` schema is introspected; Supabase's internal
 * `auth`/`storage`/etc. schemas are excluded.
 *
 * DATABASE_URL is the Supabase session pooler (port 5432) — same string the
 * runner uses. Pass it inline when running drizzle-kit.
 */
export default defineConfig({
	dialect: "postgresql",
	out: "./drizzle",
	schemaFilter: ["public"],
	// biome-ignore lint/style/noNonNullAssertion: required at introspection time
	dbCredentials: { url: process.env.DATABASE_URL! },
});
