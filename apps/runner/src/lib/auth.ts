import { createHash } from "node:crypto";
import { apiKeys, personalAccessTokens, workspaceUser } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toWebHeaders } from "./auth/headers.js";
import { auth } from "./auth/index.js";
import { db } from "./pg.js";
import { scopesForRole } from "./scopes.js";

/**
 * Every authenticator normalizes its credential into this single shape; route
 * handlers depend only on `principal.scopes` (and, for mutations, `kind`).
 *   - `kind: "user"`   — human identity (browser session or PAT); scopes resolved
 *     per-request from the user's current workspace role.
 *   - `kind: "apiKey"` — machine identity; workspace-pinned, fixed scopes.
 */
export type Principal =
	| { kind: "user"; userId: string; tokenId?: string; scopes: string[] }
	| {
			kind: "apiKey";
			workspaceId: string;
			scopes: string[];
			allowedOrigins: string[] | null;
	  };

declare module "fastify" {
	interface FastifyRequest {
		principal: Principal | undefined;
	}
}

/** Throws unless a `requireUserId`-style guard has already run. */
export function userPrincipal(
	request: FastifyRequest,
): Extract<Principal, { kind: "user" }> {
	const principal = request.principal;
	if (principal?.kind !== "user") {
		throw new Error("userPrincipal called without a user-kind principal");
	}
	return principal;
}

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

// On failure the authenticator has already sent a reply (caller just `return`s).
type AuthResult = { ok: true; principal: Principal } | { ok: false };

/**
 * The target workspace comes from the `:workspaceId` path param, not the
 * credential. Returns `null` (after sending a 403) if the user isn't a member.
 * On unscoped routes (no path param) scopes default to empty, so those routes
 * must not depend on `scopes` for resource access.
 */
async function resolveUserScopes(
	request: FastifyRequest,
	reply: FastifyReply,
	userId: string,
): Promise<string[] | null> {
	const pathWorkspaceId = (request.params as { workspaceId?: string })
		?.workspaceId;

	if (!pathWorkspaceId) {
		return [];
	}

	// A user-kind credential is only as powerful as the holder's current role —
	// demote a user and their sessions and PATs lose access on the next request.
	try {
		const [membership] = await db
			.select({ role: workspaceUser.role })
			.from(workspaceUser)
			.where(
				and(
					eq(workspaceUser.user_id, userId),
					eq(workspaceUser.workspace_id, pathWorkspaceId),
				),
			)
			.limit(1);

		if (!membership) {
			reply
				.code(403)
				.send({ message: "User is not a member of this workspace" });
			return null;
		}

		return scopesForRole(membership.role);
	} catch {
		reply.code(403).send({ message: "User is not a member of this workspace" });
		return null;
	}
}

async function authenticateBrowserSession(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<AuthResult> {
	const session = await auth.api.getSession({
		headers: toWebHeaders(request.headers),
	});

	if (!session) {
		reply.code(401).send({ message: "Authentication required" });
		return { ok: false };
	}

	const userId = session.user.id;

	const scopes = await resolveUserScopes(request, reply, userId);
	if (scopes === null) {
		return { ok: false };
	}

	return { ok: true, principal: { kind: "user", userId, scopes } };
}

async function authenticatePat(
	request: FastifyRequest,
	reply: FastifyReply,
	token: string,
): Promise<AuthResult> {
	const tokenHash = sha256Hex(token);

	let pat:
		| {
				id: string;
				user_id: string;
				expires_at: string | null;
				revoked_at: string | null;
		  }
		| undefined;
	try {
		[pat] = await db
			.select({
				id: personalAccessTokens.id,
				user_id: personalAccessTokens.user_id,
				expires_at: personalAccessTokens.expires_at,
				revoked_at: personalAccessTokens.revoked_at,
			})
			.from(personalAccessTokens)
			.where(eq(personalAccessTokens.token_hash, tokenHash))
			.limit(1);
	} catch {
		reply.code(401).send({ message: "Invalid token" });
		return { ok: false };
	}

	if (!pat) {
		reply.code(401).send({ message: "Invalid token" });
		return { ok: false };
	}
	if (pat.revoked_at !== null) {
		reply.code(401).send({ message: "Token has been revoked" });
		return { ok: false };
	}
	if (
		pat.expires_at !== null &&
		new Date(pat.expires_at).getTime() <= Date.now()
	) {
		reply.code(401).send({ message: "Token has expired" });
		return { ok: false };
	}

	const scopes = await resolveUserScopes(request, reply, pat.user_id);
	if (scopes === null) {
		return { ok: false };
	}

	// Fire-and-forget last-used bump; swallow errors so it never fails the request.
	void db
		.update(personalAccessTokens)
		.set({ last_used_at: new Date().toISOString() })
		.where(eq(personalAccessTokens.id, pat.id))
		.execute()
		.catch(() => {});

	return {
		ok: true,
		principal: { kind: "user", userId: pat.user_id, tokenId: pat.id, scopes },
	};
}

async function authenticateApiKey(
	request: FastifyRequest,
	reply: FastifyReply,
	apiKey: string,
): Promise<AuthResult> {
	let apiKeyData:
		| {
				workspace_id: string;
				scopes: string[];
				allowed_origins: string[] | null;
		  }
		| undefined;
	try {
		[apiKeyData] = await db
			.select({
				workspace_id: apiKeys.workspace_id,
				scopes: apiKeys.scopes,
				allowed_origins: apiKeys.allowed_origins,
			})
			.from(apiKeys)
			.where(eq(apiKeys.key, apiKey))
			.limit(1);
	} catch {
		reply.code(403).send({ message: "Invalid API key" });
		return { ok: false };
	}

	if (!apiKeyData) {
		reply.code(403).send({ message: "Invalid API key" });
		return { ok: false };
	}

	const pathWorkspaceId = (request.params as { workspaceId?: string })
		?.workspaceId;
	if (pathWorkspaceId && pathWorkspaceId !== apiKeyData.workspace_id) {
		reply
			.code(403)
			.send({ message: "API key is not scoped to this workspace" });
		return { ok: false };
	}

	const allowedOrigins = apiKeyData.allowed_origins ?? null;

	if (allowedOrigins && allowedOrigins.length > 0) {
		const origin = request.headers.origin as string | undefined;
		if (!origin || !allowedOrigins.includes(origin)) {
			reply.code(403).send({ message: "Origin not allowed for this API key" });
			return { ok: false };
		}
	}

	return {
		ok: true,
		principal: {
			kind: "apiKey",
			workspaceId: apiKeyData.workspace_id,
			scopes: apiKeyData.scopes ?? [],
			allowedOrigins,
		},
	};
}

/**
 * Dispatch is a pure header check, with the browser cookie session as fallback:
 *   1. `x-pat`     → PAT     → kind "user"
 *   2. `x-api-key` → API key → kind "apiKey"
 *   3. otherwise   → browser session (httpOnly cookie) → kind "user"
 *
 * A credential that is present but invalid/expired/revoked is rejected outright;
 * we never fall through to a later authenticator.
 *
 * Call this directly on a scoped instance — not via fastify.register().
 */
export function addAuth(fastify: FastifyInstance) {
	fastify.decorateRequest("principal", undefined);

	fastify.addHook(
		"preHandler",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const patToken = request.headers["x-pat"] as string | undefined;
			const apiKey = request.headers["x-api-key"] as string | undefined;

			let result: AuthResult;

			if (patToken !== undefined) {
				const token = patToken.trim();
				if (!token) {
					return reply.code(401).send({ message: "Empty x-pat token" });
				}

				result = await authenticatePat(request, reply, token);
			} else if (apiKey) {
				result = await authenticateApiKey(request, reply, apiKey);
			} else {
				result = await authenticateBrowserSession(request, reply);
			}

			if (!result.ok) {
				return;
			}

			request.principal = result.principal;
		},
	);
}
