import { fail } from "./errors.js";

/** Max key/value pairs a run may carry (mirrors the server-side cap). */
const MAX_META_KEYS = 10;
/** Keys and values must each be shorter than this (mirrors the server). */
const MAX_META_FIELD_LENGTH = 128;

/**
 * Parse repeatable `--meta key=value` flags into an object, applying the same
 * caps the server enforces so mistakes fail locally with a clear message rather
 * than as an opaque 400. Returns undefined when no `--meta` was passed.
 */
export function buildMetadata(
	raw: string | string[] | undefined,
): Record<string, string> | undefined {
	const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
	if (entries.length === 0) return undefined;

	const meta: Record<string, string> = {};
	for (const entry of entries) {
		const eq = entry.indexOf("=");
		if (eq < 0) {
			fail(`--meta must be in key=value form (got "${entry}").`);
		}
		const key = entry.slice(0, eq).trim();
		const value = entry.slice(eq + 1);
		if (!key) {
			fail(`--meta key is empty in "${entry}".`);
		}
		if (
			key.length >= MAX_META_FIELD_LENGTH ||
			value.length >= MAX_META_FIELD_LENGTH
		) {
			fail(
				`--meta key and value must each be under ${MAX_META_FIELD_LENGTH} characters ("${key}").`,
			);
		}
		meta[key] = value;
	}

	if (Object.keys(meta).length > MAX_META_KEYS) {
		fail(`--meta allows at most ${MAX_META_KEYS} keys.`);
	}

	return meta;
}
