import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./db.js";
import { scopesForRole } from "./scopes.js";

declare module "fastify" {
	interface FastifyRequest {
		workspaceId: string;
		userId: string | undefined;
		tokenId: string | undefined;
		scopes: string[];
		allowedOrigins: string[] | null;
	}
}

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

/**
 * Registers dual authentication on the given Fastify instance.
 *
 * Order of attempts:
 *   1. `Authorization: Bearer <pat>` — personal access token (user-bound).
 *      Populates workspaceId + userId + scopes derived from the user's
 *      current `workspace_user.role` (see scopesForRole). Origin allowlist
 *      is skipped (PATs are CLI-issued, no browser origin to validate).
 *   2. `x-api-key: <key>` — API key (workspace-bound, machine identity).
 *      Populates workspaceId + scopes + allowedOrigins, leaves userId
 *      undefined, enforces origin allowlist when configured.
 *
 * If a bearer token is present but invalid/expired/revoked, the request is
 * rejected with 401 — we do not fall through to the API-key path, since
 * silently masking token issues would be confusing.
 *
 * Per-route scope checks: see `requireScope` / `checkScope` in ./scopes.js.
 * Mutating endpoints should chain `requireUserId` to keep API keys out.
 *
 * Call this directly on a scoped instance — not via fastify.register().
 */
export function addAuth(fastify: FastifyInstance) {
	fastify.decorateRequest("workspaceId", null as unknown as string);
	fastify.decorateRequest("userId", undefined);
	fastify.decorateRequest("tokenId", undefined);
	fastify.decorateRequest("scopes", null as unknown as string[]);
	fastify.decorateRequest("allowedOrigins", null);

	fastify.addHook(
		"preHandler",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const authHeader = request.headers.authorization;

			if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
				const token = authHeader.slice("Bearer ".length).trim();
				if (!token) {
					return reply.code(401).send({ message: "Empty bearer token" });
				}

				const tokenHash = sha256Hex(token);
				const { data: pat, error } = await supabase
					.from("personal_access_tokens")
					.select("id, user_id, workspace_id, expires_at, revoked_at")
					.eq("token_hash", tokenHash)
					.maybeSingle();

				if (error || !pat) {
					return reply.code(401).send({ message: "Invalid token" });
				}
				if (pat.revoked_at !== null) {
					return reply.code(401).send({ message: "Token has been revoked" });
				}
				if (
					pat.expires_at !== null &&
					new Date(pat.expires_at).getTime() <= Date.now()
				) {
					return reply.code(401).send({ message: "Token has expired" });
				}

				// Resolve the user's current role in this workspace. A PAT is
				// only as powerful as its holder's role — demote a user and
				// their PATs lose access on the next request.
				const { data: membership, error: membershipError } = await supabase
					.from("workspace_user")
					.select("role")
					.eq("user_id", pat.user_id)
					.eq("workspace_id", pat.workspace_id)
					.maybeSingle();

				if (membershipError || !membership) {
					return reply.code(401).send({
						message: "User is no longer a member of this workspace",
					});
				}

				request.workspaceId = pat.workspace_id;
				request.userId = pat.user_id;
				request.tokenId = pat.id;
				request.scopes = scopesForRole(membership.role);
				request.allowedOrigins = null;

				void supabase
					.from("personal_access_tokens")
					.update({ last_used_at: new Date().toISOString() })
					.eq("id", pat.id);
				return;
			}

			const apiKey = request.headers["x-api-key"] as string | undefined;

			if (!apiKey) {
				return reply.code(401).send({
					message:
						"Authentication required (Authorization: Bearer or x-api-key)",
				});
			}

			const { data: apiKeyData, error } = await supabase
				.from("api_keys")
				.select("workspace_id, scopes, allowed_origins")
				.eq("key", apiKey)
				.single();

			if (error || !apiKeyData) {
				return reply.code(403).send({ message: "Invalid API key" });
			}

			request.workspaceId = apiKeyData.workspace_id;
			request.userId = undefined;
			request.tokenId = undefined;
			request.scopes = apiKeyData.scopes ?? [];
			request.allowedOrigins = apiKeyData.allowed_origins ?? null;

			if (request.allowedOrigins && request.allowedOrigins.length > 0) {
				const origin = request.headers.origin as string | undefined;
				if (!origin || !request.allowedOrigins.includes(origin)) {
					return reply
						.code(403)
						.send({ message: "Origin not allowed for this API key" });
				}
			}
		},
	);
}
