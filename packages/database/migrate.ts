import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Generated SQL migrations live in ./drizzle, a sibling of the compiled ./dist
 * this file ends up in — so resolve relative to this module, not cwd. (`drizzle`
 * is listed in package.json `files` so it ships alongside `dist`.)
 */
const migrationsFolder = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"../drizzle",
);

/**
 * Apply any pending Drizzle migrations, then return. Idempotent: Drizzle tracks
 * what's applied in a `__drizzle_migrations` table, so this is a no-op once the
 * DB is up to date — safe to call on every server boot.
 *
 * Uses a dedicated `max: 1` connection (Drizzle's recommendation for
 * migrations) that is closed when done, so it never borrows from or interferes
 * with the app's shared pool.
 */
export async function runMigrations(
	connectionString = process.env.DATABASE_URL,
) {
	if (!connectionString) {
		throw new Error("DATABASE_URL is not set (Postgres connection string)");
	}

	const migrationClient = postgres(connectionString, {
		ssl: "require",
		max: 1,
	});

	try {
		await migrate(drizzle(migrationClient), { migrationsFolder });
	} finally {
		await migrationClient.end();
	}
}
