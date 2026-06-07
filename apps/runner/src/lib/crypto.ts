import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric secret encryption (Phase 6 of the Supabase -> self-contained
 * migration). Provider/MCP config blobs are stored reversibly encrypted at rest
 * (the runner needs the plaintext to call providers), so a DB dump / dashboard
 * access / RLS slip is useless without this key.
 *
 * This replaces the old asymmetric PGP scheme (`openpgp.js`), which only existed
 * because the *untrusted browser* used to write secrets straight into the DB. Now
 * that every write goes through the trusted runner, the runner is the sole
 * encryptor *and* decryptor, so a single symmetric key (AES-256-GCM, authenticated)
 * is both simpler and sufficient. See decision D13.
 *
 * Stored format: a self-describing string so we can detect it (vs. legacy PGP
 * armor) during the transition and evolve the scheme later:
 *
 *     aes-256-gcm:<base64( iv(12) ‖ authTag(16) ‖ ciphertext )>
 */

const PREFIX = "aes-256-gcm:";
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16; // GCM auth tag length

// 32-byte key from CONFIG_ENCRYPTION_KEY, accepted as base64 (e.g.
// `openssl rand -base64 32`) or 64-char hex. Validated eagerly at module load,
// like pg.ts / storage.ts, so a misconfigured runner fails fast at boot.
const parseKey = (): Buffer => {
	const raw = process.env.CONFIG_ENCRYPTION_KEY;
	if (!raw) {
		throw new Error(
			"CONFIG_ENCRYPTION_KEY is not set (32-byte base64 or hex key for config encryption)",
		);
	}
	const key = /^[0-9a-fA-F]{64}$/.test(raw)
		? Buffer.from(raw, "hex")
		: Buffer.from(raw, "base64");
	if (key.length !== 32) {
		throw new Error(
			`CONFIG_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}); generate one with \`openssl rand -base64 32\``,
		);
	}
	return key;
};

const KEY = parseKey();

/** Encrypt a UTF-8 plaintext into the self-describing `aes-256-gcm:` format. */
export const encryptSecret = (plaintext: string): string => {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", KEY, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
};

/** True if `blob` is in our AES format (vs. legacy PGP armor). */
export const isAesSecret = (blob: string): boolean => blob.startsWith(PREFIX);

/**
 * Decrypt a blob produced by `encryptSecret`. Throws on a non-AES blob, a wrong
 * key, or tampering (GCM tag mismatch). The runtime is AES-only; legacy PGP rows
 * are converted ahead of cutover by scripts/reencrypt-configs.ts, not here.
 */
export const decryptSecret = (blob: string): string => {
	if (!isAesSecret(blob)) {
		throw new Error("decryptSecret: not an aes-256-gcm secret");
	}
	const buf = Buffer.from(blob.slice(PREFIX.length), "base64");
	const iv = buf.subarray(0, IV_BYTES);
	const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
	const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
	const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
	decipher.setAuthTag(tag);
	return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
};
