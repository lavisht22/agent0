import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Direct Postgres connection (postgres.js + Drizzle). All runner data access
 * goes through this client.
 *
 * Connection string: when pointed at a pooled host, use a **session pooler**
 * (port 5432) rather than a transaction pooler (6543) — the former supports
 * prepared statements and persistent-connection semantics, so no
 * `prepare: false` workaround is needed.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error(
		"DATABASE_URL is not set (Postgres connection string)",
	);
}

export const sql = postgres(connectionString, {
	ssl: "require",
});

export const db = drizzle(sql);
