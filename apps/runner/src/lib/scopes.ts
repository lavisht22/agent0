import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Match a required scope against a granted scope. Both must have exactly three
 * segments separated by `:`. Each segment of the granted scope must equal the
 * required segment OR be the wildcard `*`. No prefix matching, no nested
 * wildcards — keep it dumb on purpose.
 *
 * Examples:
 *   matches("agents:run:*",       "agents:run:abc") → true
 *   matches("*:*:*",              "agents:run:abc") → true
 *   matches("agents:run:abc",     "agents:run:abc") → true
 *   matches("agents:run:abc",     "agents:run:xyz") → false
 *   matches("agents:read:*",      "agents:run:abc") → false
 */
function scopeMatches(granted: string, required: string): boolean {
	const g = granted.split(":");
	const r = required.split(":");
	if (g.length !== 3 || r.length !== 3) return false;
	for (let i = 0; i < 3; i++) {
		if (g[i] !== "*" && g[i] !== r[i]) return false;
	}
	return true;
}

/**
 * Returns true if any of the granted scopes satisfies the required scope.
 */
export function hasScope(granted: string[], required: string): boolean {
	return granted.some((g) => scopeMatches(g, required));
}

/**
 * preHandler factory. Use when the required scope is statically known
 * (i.e. doesn't depend on the request body/params).
 *
 *   { preHandler: requireScope("runs:read:*") }
 */
export function requireScope(required: string) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		if (!hasScope(request.scopes, required)) {
			return reply
				.code(403)
				.send({ message: `Missing required scope: ${required}` });
		}
	};
}

/**
 * Inline check for routes where the required scope depends on request data
 * (e.g. agent_id from the body or params). Returns true if allowed; if not,
 * sends a 403 and returns false — caller should `return` immediately.
 */
export function checkScope(
	request: FastifyRequest,
	reply: FastifyReply,
	required: string,
): boolean {
	if (hasScope(request.scopes, required)) return true;
	reply.code(403).send({ message: `Missing required scope: ${required}` });
	return false;
}
