import type { RunMetadata } from "./types.js";

/** Max number of key/value pairs a single run may carry. */
export const MAX_METADATA_KEYS = 10;
/** Keys and values must each be shorter than this many characters. */
export const MAX_METADATA_FIELD_LENGTH = 128;

/** Thrown when caller-supplied metadata violates the shape/size rules. */
export class MetadataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MetadataError";
	}
}

/**
 * Validate and normalize caller-supplied run metadata.
 *
 * Enforces the run-metadata contract (string→string, ≤{@link MAX_METADATA_KEYS}
 * keys, key/value each < {@link MAX_METADATA_FIELD_LENGTH} chars). Returns the
 * normalized object, or `undefined` when there's nothing to store (absent or
 * empty) so the DB column stays NULL and out of the partial GIN index. Throws
 * {@link MetadataError} on any violation.
 *
 * Shared by every entry point that accepts metadata (run request bodies and the
 * list filter) so the rules can't drift between surfaces.
 */
export function parseRunMetadata(raw: unknown): RunMetadata | undefined {
	if (raw === undefined || raw === null) return undefined;

	if (typeof raw !== "object" || Array.isArray(raw)) {
		throw new MetadataError(
			"metadata must be an object of string key-value pairs",
		);
	}

	const entries = Object.entries(raw as Record<string, unknown>);
	if (entries.length === 0) return undefined;

	if (entries.length > MAX_METADATA_KEYS) {
		throw new MetadataError(
			`metadata may not have more than ${MAX_METADATA_KEYS} keys (got ${entries.length})`,
		);
	}

	const result: RunMetadata = {};
	for (const [key, value] of entries) {
		if (key.length === 0) {
			throw new MetadataError("metadata keys must not be empty");
		}
		if (key.length >= MAX_METADATA_FIELD_LENGTH) {
			throw new MetadataError(
				`metadata key "${key}" must be shorter than ${MAX_METADATA_FIELD_LENGTH} characters`,
			);
		}
		if (typeof value !== "string") {
			throw new MetadataError(`metadata value for "${key}" must be a string`);
		}
		if (value.length >= MAX_METADATA_FIELD_LENGTH) {
			throw new MetadataError(
				`metadata value for "${key}" must be shorter than ${MAX_METADATA_FIELD_LENGTH} characters`,
			);
		}
		result[key] = value;
	}

	return result;
}
