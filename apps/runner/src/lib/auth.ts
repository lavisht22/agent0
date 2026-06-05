import { createHash } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "./auth/index.js";
import { supabase } from "./db.js";
import { scopesForRole } from "./scopes.js";

/**
 * One principal, many credentials. Every authenticator below normalizes its
 * credential (browser session, PAT, API key) into this single shape; route
 * handlers depend only on `principal.scopes` (and, for mutations, `kind`),
 * never on *how* the caller authenticated.
 *
 *   - `kind: "user"`   — a human identity. Browser session (Supabase JWT) or
 *     PAT (`agent0_pat_…`). Scopes are resolved per-request from the user's
 *     current `workspace_user.role` against the path's workspace.
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
		userId: string | undefined;
		tokenId: string | undefined;
		scopes: string[];
	}
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
	const { data: membership, error } = await supabase
		.from("workspace_user")
		.select("role")
		.eq("user_id", userId)
		.eq("workspace_id", pathWorkspaceId)
		.maybeSingle();

	if (error || !membership) {
		reply.code(403).send({ message: "User is not a member of this workspace" });
		return null;
	}

	return scopesForRole(membership.role);
}

/**
 * Browser session → `kind: "user"`. Validates the better-auth session bearer
 * token and derives scopes from the user's current workspace role. Selected when
 * an `Authorization: Bearer` token is present (Bearer is now exclusively the
 * browser-session channel; PATs moved to the `x-pat` header). The bearer plugin
 * lets `getSession` read the token straight off the `Authorization` header.
 */
async function authenticateBrowserSession(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<AuthResult> {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(request.headers),
	});

	if (!session) {
		reply.code(401).send({ message: "Invalid token" });
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
	const { data: pat, error } = await supabase
		.from("personal_access_tokens")
		.select("id, user_id, expires_at, revoked_at")
		.eq("token_hash", tokenHash)
		.maybeSingle();

	if (error || !pat) {
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

	void supabase
		.from("personal_access_tokens")
		.update({ last_used_at: new Date().toISOString() })
		.eq("id", pat.id);

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
	const { data: apiKeyData, error } = await supabase
		.from("api_keys")
		.select("workspace_id, scopes, allowed_origins")
		.eq("key", apiKey)
		.single();

	if (error || !apiKeyData) {
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
 * Project the resolved principal onto the request. Route handlers read the
 * discrete `userId` / `tokenId` / `scopes` decorations directly. (Origin
 * enforcement for API keys happens inside `authenticateApiKey`; no handler reads
 * the allowlist, so it lives only on the principal.)
 */
function applyPrincipal(request: FastifyRequest, principal: Principal): void {
	request.principal = principal;
	if (principal.kind === "user") {
		request.userId = principal.userId;
		request.tokenId = principal.tokenId;
		request.scopes = principal.scopes;
	} else {
		request.userId = undefined;
		request.tokenId = undefined;
		request.scopes = principal.scopes;
	}
}

/**
 * Registers authentication on the given Fastify instance.
 *
 * The middleware is an ordered list of authenticators (Passport-style
 * strategies); the credential present on the request selects which one runs,
 * and the winner is normalized to a single `Principal`. Each credential has its
 * own header, so dispatch is a pure header check — no prefix-sniffing:
 *
 *   1. `x-pat: <token>`              → PAT            → kind "user"
 *   2. `Authorization: Bearer <jwt>` → browser session (Supabase JWT) → kind "user"
 *   3. `x-api-key: <key>`            → API key        → kind "apiKey"
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
	fastify.decorateRequest("userId", undefined);
	fastify.decorateRequest("tokenId", undefined);
	fastify.decorateRequest("scopes", null as unknown as string[]);

	fastify.addHook(
		"preHandler",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const patToken = request.headers["x-pat"] as string | undefined;
			const authHeader = request.headers.authorization;

			let result: AuthResult;

			if (patToken !== undefined) {
				const token = patToken.trim();
				if (!token) {
					return reply.code(401).send({ message: "Empty x-pat token" });
				}

				result = await authenticatePat(request, reply, token);
			} else if (
				typeof authHeader === "string" &&
				authHeader.startsWith("Bearer ")
			) {
				const token = authHeader.slice("Bearer ".length).trim();
				if (!token) {
					return reply.code(401).send({ message: "Empty bearer token" });
				}

				result = await authenticateBrowserSession(request, reply);
			} else {
				const apiKey = request.headers["x-api-key"] as string | undefined;

				if (!apiKey) {
					return reply.code(401).send({
						message:
							"Authentication required (x-pat, Authorization: Bearer, or x-api-key)",
					});
				}

				result = await authenticateApiKey(request, reply, apiKey);
			}

			// Authenticator already sent the failure reply.
			if (!result.ok) {
				return;
			}

			applyPrincipal(request, result.principal);
		},
	);
}
