import { workspaces } from "@repo/database";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "./pg.js";
import { hasScope } from "./scopes.js";

/**
 * Shared workspace-management authorization.
 *
 * "Admin or owner" gates destructive/administrative workspace actions (settings,
 * deletion, run cleanup). Admin ⟺ the resolved scopes include the workspace
 * write grant (only the admin role gets `*:*:*`). The owner check is an escape
 * hatch so the creator can never lock themselves out — e.g. after being demoted.
 */

export function isAdmin(request: FastifyRequest): boolean {
	return hasScope(request.principal?.scopes ?? [], "workspaces:write:*");
}

export async function isOwner(
	workspaceId: string,
	userId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ user_id: workspaces.user_id })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.limit(1);
	return !!row && row.user_id === userId;
}

/**
 * Returns true if allowed; otherwise sends a 403 and returns false. The owner
 * check is only consulted when the caller isn't already an admin.
 */
export async function requireAdminOrOwner(
	request: FastifyRequest,
	reply: FastifyReply,
	workspaceId: string,
	userId: string,
): Promise<boolean> {
	if (isAdmin(request)) return true;
	if (await isOwner(workspaceId, userId)) return true;
	reply.code(403).send({ message: "Admin or workspace owner required" });
	return false;
}
