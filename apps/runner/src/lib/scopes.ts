import type { workspaceUserRole } from "@repo/database";
import type { FastifyReply, FastifyRequest } from "fastify";

type WorkspaceRole = (typeof workspaceUserRole.enumValues)[number];

/**
 * Scopes for a role, resolved per-request (not snapshotted onto the PAT row) so
 * promote/demote take effect immediately.
 *   admin  → full access
 *   writer → reads everything + writes/runs agents, versions, tags. NOT mcps,
 *            providers, or api_keys — those are admin-managed.
 *   reader → reads everything + trigger runs.
 */
export function scopesForRole(role: WorkspaceRole): string[] {
	switch (role) {
		case "admin":
			return ["*:*:*"];
		case "writer":
			return ["*:read:*", "agents:run:*", "agents:write:*", "tags:write:*"];
		case "reader":
			return ["*:read:*", "agents:run:*"];
	}
}

/**
 * Three colon-segments; each granted segment must equal the required one or be
 * `*`. No prefix matching, no nested wildcards — deliberately dumb.
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

export function hasScope(granted: string[], required: string): boolean {
	return granted.some((g) => scopeMatches(g, required));
}

/** preHandler factory for a statically-known required scope. */
export function requireScope(required: string) {
	return async (request: FastifyRequest, reply: FastifyReply) => {
		if (!hasScope(request.principal?.scopes ?? [], required)) {
			return reply
				.code(403)
				.send({ message: `Missing required scope: ${required}` });
		}
	};
}

/**
 * Inline check for routes where the required scope depends on request data.
 * Returns true if allowed; otherwise sends a 403 and returns false.
 */
export function checkScope(
	request: FastifyRequest,
	reply: FastifyReply,
	required: string,
): boolean {
	if (hasScope(request.principal?.scopes ?? [], required)) return true;
	reply.code(403).send({ message: `Missing required scope: ${required}` });
	return false;
}

/** Gates write endpoints: API keys are read/run-only, only PATs can mutate. */
export async function requireUserId(
	request: FastifyRequest,
	reply: FastifyReply,
) {
	if (request.principal?.kind !== "user") {
		return reply.code(403).send({
			message:
				"This endpoint requires a personal access token; API keys cannot mutate state",
		});
	}
}
