import { createHash } from "node:crypto";
import { apiKeys, personalAccessTokens, workspaceUser } from "@repo/database";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { toWebHeaders } from "./auth/headers.js";
import { auth } from "./auth/index.js";
import { db } from "./pg.js";
import { scopesForRole } from "./scopes.js";

/**
 * One principal, many credentials. Every authenticator below normalizes its
 * credential (browser session, PAT, API key) into this single shape; route
 * handlers depend only on `principal.scopes` (and, for mutations, `kind`),
 * never on *how* the caller authenticated.
 *
 *   - `kind: "user"`   — a human identity. Browser session (better-auth httpOnly
 *     cookie) or PAT (`agent0_pat_…`). Scopes are resolved per-request from the
 *     user's current `workspace_user.role` against the path's workspace.
 *   - `kind: "apiKey"` — a machine identity. Workspace-pinned, fixed scopes,
 *     optional origin allowlist. No user.
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

/**
 * Narrow the request's principal to the user kind. Safe to call only after
 * `requireUserId` (or an equivalent guard) has run; it throws otherwise, which
 * surfaces a misconfigured route as a 500 rather than a silent `undefined`.
 */
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

/**
 * Outcome of an authenticator. On failure the authenticator has already sent a
 * reply (so the caller just `return`s); on success it yields a `Principal`.
 */
type AuthResult = { ok: true; principal: Principal } | { ok: false };

/**
 * Resolve a user's effective scopes for the request's target workspace.
 *
 * The workspace a request targets is taken from the `:workspaceId` path param
 * (see the prefix block in routes/index.ts), not from the credential. Shared by
 * the browser-session and PAT authenticators so both derive identical scopes.
 *
 * Returns the scopes, or `null` if the user isn't a member of the path's
 * workspace (a 403 has already been sent). On unscoped routes (no path param —
 * e.g. /api/v1/me) the membership check is skipped and scopes default to empty;
 * routes there must not depend on `scopes` for resource access.
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

	// Resolve the user's current role in this workspace. A user-kind credential
	// is only as powerful as the holder's role — demote a user and their browser
	// sessions and PATs lose access on the next request.
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

/**
 * Browser session → `kind: "user"`. Validates the better-auth session from the
 * httpOnly cookie and derives scopes from the user's current workspace role.
 * This is the fallback authenticator — it runs whenever the request carries
 * neither `x-pat` nor `x-api-key`, i.e. it's the browser app. `getSession`
 * reads the session cookie out of the forwarded request headers.
 */
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

/**
 * PAT → `kind: "user"`. Looks up the hashed token, checks revocation/expiry,
 * then resolves scopes from the holder's current workspace role. Selected when
 * the `x-pat` header is present — a dedicated transport that keeps PATs cleanly
 * distinct from browser sessions (Bearer) and machine keys (`x-api-key`).
 */
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

	// Fire-and-forget last-used bump. Drizzle queries are lazy, so call
	// `.execute()` to actually run it, and swallow errors to keep it
	// non-blocking (a failed bump must never fail the request).
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

/**
 * API key → `kind: "apiKey"`. Workspace-pinned machine identity on the distinct
 * `x-api-key` header. 403s if the path's workspace differs from the key's pinned
 * workspace, and enforces the origin allowlist when configured.
 */
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
 * Registers authentication on the given Fastify instance.
 *
 * The middleware is an ordered list of authenticators (Passport-style
 * strategies); the credential present on the request selects which one runs,
 * and the winner is normalized to a single `Principal`. Dispatch is a pure
 * header check, with the browser cookie session as the fallback:
 *
 *   1. `x-pat: <token>`   → PAT                          → kind "user"
 *   2. `x-api-key: <key>` → API key                      → kind "apiKey"
 *   3. otherwise          → browser session (httpOnly cookie, better-auth) → kind "user"
 *
 * If a credential is present but invalid/expired/revoked, the request is
 * rejected — we do not fall through to a later authenticator, since silently
 * masking token issues would be confusing.
 *
 * Per-route scope checks: see `requireScope` / `checkScope` in ./scopes.js.
 * Mutating endpoints should chain `requireUserId` to keep API keys out.
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
				// No PAT and no API key → the caller is the browser app, identified
				// by its httpOnly better-auth session cookie (read inside getSession).
				result = await authenticateBrowserSession(request, reply);
			}

			// Authenticator already sent the failure reply.
			if (!result.ok) {
				return;
			}

			request.principal = result.principal;
		},
	);
}
