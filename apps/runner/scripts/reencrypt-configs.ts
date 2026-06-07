import "dotenv/config";
import * as openpgp from "openpgp";
import { encryptSecret, isAesSecret } from "../src/lib/crypto.js";
import { sql } from "../src/lib/pg.js";

/**
 * One-shot re-encryption: legacy client-side PGP blobs -> runner-side AES-256-GCM
 * (Phase 6 / decision D13 of the Supabase -> self-contained migration).
 *
 * For every `providers` + `mcps` row it reads each non-null
 * `encrypted_data_production` / `encrypted_data_staging` value and:
 *   - skips it if it's already in our AES format (idempotent / safe to re-run),
 *   - PGP-decrypts then AES-encrypts it if it's PGP-armored,
 *   - leaves anything in an unrecognized format untouched (and warns).
 *
 * Run from apps/runner with DATABASE_URL + PGP_PRIVATE_KEY[_PASSPHRASE] +
 * CONFIG_ENCRYPTION_KEY in the environment:
 *
 *     pnpm --filter runner reencrypt-configs           # apply
 *     DRY_RUN=1 pnpm --filter runner reencrypt-configs # report only, no writes
 *
 * ⚠️ Run this with the PGP-only runtime stopped (or already replaced by the
 * AES-aware runtime): a runtime that only understands PGP cannot read the rows
 * this flips to AES. See the Phase 6 cutover note in the migration doc.
 */

const PGP_ARMOR = "-----BEGIN PGP MESSAGE-----";
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry");

let cachedPrivateKey: Awaited<
	ReturnType<typeof openpgp.decryptKey>
> | null = null;

const getPrivateKey = async () => {
	if (!cachedPrivateKey) {
		cachedPrivateKey = await openpgp.decryptKey({
			privateKey: await openpgp.readPrivateKey({
				armoredKey: process.env.PGP_PRIVATE_KEY || "",
			}),
			passphrase: process.env.PGP_PRIVATE_KEY_PASSPHRASE || "",
		});
	}
	return cachedPrivateKey;
};

const pgpDecrypt = async (armored: string): Promise<string> => {
	const message = await openpgp.readMessage({ armoredMessage: armored });
	const { data } = await openpgp.decrypt({
		message,
		decryptionKeys: await getPrivateKey(),
	});
	return data as string;
};

// Returns the (possibly re-encrypted) value and whether it changed. Validates
// that a decrypted blob is the JSON we expect, so a wrong key / garbage decrypt
// surfaces as an error instead of silently writing corruption.
const convert = async (
	value: string | null,
): Promise<{ value: string | null; changed: boolean }> => {
	if (value == null) return { value, changed: false };
	if (isAesSecret(value)) return { value, changed: false };
	if (!value.startsWith(PGP_ARMOR)) {
		console.warn("    ! unrecognized format (not PGP, not AES) — left untouched");
		return { value, changed: false };
	}
	const plaintext = await pgpDecrypt(value);
	JSON.parse(plaintext); // integrity check: configs are always JSON
	return { value: encryptSecret(plaintext), changed: true };
};

const migrateTable = async (table: "providers" | "mcps", jsonb: boolean) => {
	// providers.encrypted_data_* is `text`; mcps.encrypted_data_* is `jsonb`
	// (a schema inconsistency). For jsonb we store the AES blob as a JSON string
	// via `to_jsonb(<text>)` — matching how the app's Drizzle write path encodes
	// it and how the runtime reads it back (Drizzle returns it as a JS string).
	const encode = (value: string | null) =>
		value === null
			? sql`null`
			: jsonb
				? sql`to_jsonb(${value}::text)`
				: sql`${value}`;

	const rows = (await sql`
		select id, encrypted_data_production, encrypted_data_staging
		from ${sql(table)}
	`) as {
		id: string;
		encrypted_data_production: string | null;
		encrypted_data_staging: string | null;
	}[];

	let migrated = 0;
	let unchanged = 0;
	let failed = 0;

	for (const row of rows) {
		try {
			const prod = await convert(row.encrypted_data_production);
			const stag = await convert(row.encrypted_data_staging);

			if (!prod.changed && !stag.changed) {
				unchanged++;
				continue;
			}

			if (!DRY_RUN) {
				await sql`
					update ${sql(table)}
					set encrypted_data_production = ${encode(prod.value)},
						encrypted_data_staging = ${encode(stag.value)}
					where id = ${row.id}
				`;
			}
			migrated++;
			console.log(
				`    ${DRY_RUN ? "[dry] would migrate" : "migrated"} ${table}/${row.id}` +
					` (prod=${prod.changed ? "re-encrypted" : "unchanged"}, ` +
					`staging=${stag.changed ? "re-encrypted" : row.encrypted_data_staging == null ? "none" : "unchanged"})`,
			);
		} catch (error) {
			failed++;
			console.error(
				`    ✗ ${table}/${row.id}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	console.log(
		`  ${table}: ${rows.length} rows — ${migrated} migrated, ${unchanged} already-AES/empty, ${failed} failed`,
	);
	return failed;
};

const main = async () => {
	console.log(
		DRY_RUN
			? "DRY RUN — no writes will be made\n"
			: "Re-encrypting provider/MCP configs (PGP -> AES-256-GCM)\n",
	);

	let failed = 0;
	failed += await migrateTable("providers", false);
	failed += await migrateTable("mcps", true);

	await sql.end();

	if (failed > 0) {
		console.error(`\nDone with ${failed} failure(s) — investigate before deploying.`);
		process.exit(1);
	}
	console.log("\nDone — all rows are now AES (or were already).");
};

main().catch(async (error) => {
	console.error("Fatal:", error);
	await sql.end().catch(() => {});
	process.exit(1);
});
