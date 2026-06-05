import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import { auth } from "../lib/auth/index.js";

/**
 * Mounts better-auth's request handler at /api/auth/*. Registered OUTSIDE the
 * `addAuth` middleware on purpose — this IS the authentication surface (OTP
 * send/verify, session, sign-out), so it cannot require an existing credential.
 *
 * Bearer-token transport (no cookies), so the existing permissive CORS is fine
 * — there are no credentialed cross-origin requests to guard. Phase 2.
 */
export async function registerBetterAuthRoutes(fastify: FastifyInstance) {
	fastify.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		async handler(request, reply) {
			const url = new URL(request.url, `http://${request.headers.host}`);

			const req = new Request(url.toString(), {
				method: request.method,
				headers: fromNodeHeaders(request.headers),
				body:
					request.method !== "GET" && request.body
						? JSON.stringify(request.body)
						: undefined,
			});

			const response = await auth.handler(req);

			reply.status(response.status);
			response.headers.forEach((value, key) => reply.header(key, value));
			reply.send(response.body ? await response.text() : null);
		},
	});
}
