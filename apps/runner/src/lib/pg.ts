import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Direct Postgres connection (postgres.js + Drizzle), introduced in Phase 2 of
 * the Supabase -> self-contained migration. It points at the SAME Supabase
 * Postgres as the Supabase SDK (`./db.ts`) and coexists with it: better-auth is
 * its first consumer (Phase 2); the rest of the runner moves off the Supabase
 * SDK onto this client in Phase 3.
 *
 * Connection string: use the Supabase **session pooler** (port 5432), which —
 * unlike the transaction pooler (6543) — supports prepared statements and
 * persistent-connection semantics, so no `prepare: false` workaround is needed.
 * SSL is required by Supabase.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error(
		"DATABASE_URL is not set (Supabase session-pooler connection string, port 5432)",
	);
}

export const sql = postgres(connectionString, {
	ssl: "require",
});

export const db = drizzle(sql);
