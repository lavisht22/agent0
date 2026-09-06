/**
 * File payloads in messages, normalized for display.
 *
 * AI SDK v7 stores file bytes as a tagged union (`{ type: "data" | "url" |
 * "text" | "reference", … }`), while everything written before it — and the
 * agent editor to this day — stores a bare base64 string or URL. Run logs hold
 * both shapes side by side, so the viewer has to read both.
 */

export type ResolvedFileData =
	| { kind: "base64"; value: string }
	| { kind: "url"; value: string }
	| { kind: "text"; value: string };

/**
 * Reduce a file payload to something renderable, or `null` when it isn't
 * displayable on its own (raw bytes, or a provider reference from
 * `uploadFile()`) — callers fall back to showing the raw JSON.
 */
export function resolveFileData(data: unknown): ResolvedFileData | null {
	if (typeof data === "string") {
		return data.startsWith("data:") || data.startsWith("http")
			? { kind: "url", value: data }
			: { kind: "base64", value: data };
	}

	if (typeof data !== "object" || data === null) {
		return null;
	}

	const tagged = data as {
		type?: unknown;
		data?: unknown;
		url?: unknown;
		text?: unknown;
	};

	switch (tagged.type) {
		case "data":
			// The tagged wrapper can itself hold bytes rather than a base64
			// string, in which case the inner resolve returns null.
			return resolveFileData(tagged.data);
		case "url":
			return typeof tagged.url === "string"
				? { kind: "url", value: tagged.url }
				: null;
		case "text":
			return typeof tagged.text === "string"
				? { kind: "text", value: tagged.text }
				: null;
		default:
			return null;
	}
}

/**
 * v7 media types may be a full IANA type (`image/png`) or just the top-level
 * segment (`image`), which providers refine from the bytes.
 */
export function isImageMediaType(mediaType: unknown): mediaType is string {
	return (
		typeof mediaType === "string" &&
		(mediaType === "image" || mediaType.startsWith("image/"))
	);
}

/** `src` for an `<img>`, from either a URL or base64 bytes. */
export function imageSrc(file: ResolvedFileData, mediaType?: string): string {
	if (file.kind === "url") return file.value;

	const type =
		isImageMediaType(mediaType) && mediaType.includes("/")
			? mediaType
			: "image/png";

	return `data:${type};base64,${file.value}`;
}

/** Rough size of base64-encoded bytes, formatted for display. */
export function formatBase64Size(value: string): string | null {
	const kb = Math.round((value.length * 3) / 4 / 1024);
	if (kb <= 0) return null;

	return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb} KB`;
}
