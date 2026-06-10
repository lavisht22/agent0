import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";

/**
 * Convert Node request headers to a Web `Headers` for better-auth. Under HTTP/2
 * Node surfaces pseudo-headers (`:method`, `:path`, …) that the Web `Headers`
 * API rejects, so they must be stripped before `fromNodeHeaders`.
 */
export function toWebHeaders(headers: IncomingHttpHeaders): Headers {
	const filtered: IncomingHttpHeaders = {};
	for (const [key, value] of Object.entries(headers)) {
		if (key.startsWith(":")) continue;
		filtered[key] = value;
	}
	return fromNodeHeaders(filtered);
}
