import type { Database } from "@repo/database";
import type { FastifyReply, FastifyRequest } from "fastify";

type WorkspaceRole = Database["public"]["Enums"]["workspace_user_role"];

/**
 * Effective scopes granted to a personal access token, derived from the
 * holder's `workspace_user.role` at the time of the request.
 *
 *   admin  → full access
 *   writer → reads of everything + writes/runs on content the user manages
 *            (agents, agent versions via `agents:write`, tags). NOT mcps,
 *            providers, or api_keys — those are admin-managed.
 *   reader → reads of everything + ability to trigger runs (matches the
 *            dashboard test endpoint, which is open to any workspace member).
 *
 * Resolved per-request rather than snapshotted onto the PAT row so that role
 * changes (promote / demote) take effect immediately.
 */
export function scopesForRole(role: WorkspaceRole): string[] {
	switch (role) {
		case "admin":
			return ["*:*:*"];
		case "writer":
			return [
				"*:read:*",
				"agents:run:*",
				"agents:write:*",
				"tags:write:*",
			];
		case "reader":
			return ["*:read:*", "agents:run:*"];
	}
}

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

/**
 * preHandler that 403s when the request is authenticated by an API key rather
 * than a personal access token. Used to gate write endpoints — API keys are
 * read/run-only; only PATs (with a known user identity) can mutate state.
 *
 *   { preHandler: [requireScope("agents:write:*"), requireUserId] }
 */
export async function requireUserId(
	request: FastifyRequest,
	reply: FastifyReply,
) {
	if (request.userId === undefined) {
		return reply.code(403).send({
			message:
				"This endpoint requires a personal access token; API keys cannot mutate state",
		});
	}
}
