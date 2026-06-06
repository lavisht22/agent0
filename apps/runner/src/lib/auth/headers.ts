import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";

/**
 * Convert Node request headers to a Web `Headers` for better-auth, stripping
 * HTTP/2 pseudo-headers first.
 *
 * Under HTTP/2 (e.g. behind the production proxy/load balancer) Node surfaces
 * pseudo-headers like `:method`, `:path`, `:scheme`, `:authority` in
 * `request.headers`. The Web `Headers` API rejects any name starting with `:`,
 * so passing them straight to `fromNodeHeaders` throws:
 *   `Headers.set: ":method" is an invalid header name.`
 * HTTP/1.1 (local dev) has no pseudo-headers, which is why this only bit prod.
 */
export function toWebHeaders(headers: IncomingHttpHeaders): Headers {
	const filtered: IncomingHttpHeaders = {};
	for (const [key, value] of Object.entries(headers)) {
		if (key.startsWith(":")) continue;
		filtered[key] = value;
	}
	return fromNodeHeaders(filtered);
}
