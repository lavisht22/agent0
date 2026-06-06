import type { FastifyInstance } from "fastify";
import { toWebHeaders } from "../lib/auth/headers.js";
import { auth } from "../lib/auth/index.js";

/**
 * Mounts better-auth's request handler at /api/auth/*. Registered OUTSIDE the
 * `addAuth` middleware on purpose — this IS the authentication surface (OTP
 * send/verify, session, sign-out), so it cannot require an existing credential.
 *
 * Sessions ride an httpOnly cookie. The browser app is same-origin (the runner
 * serves the SPA in prod; a Vite proxy makes dev same-origin), so the cookie
 * flows without any credentialed-CORS dance. Phase 2.
 */
export async function registerBetterAuthRoutes(fastify: FastifyInstance) {
	fastify.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		async handler(request, reply) {
			const url = new URL(request.url, `http://${request.headers.host}`);

			const req = new Request(url.toString(), {
				method: request.method,
				headers: toWebHeaders(request.headers),
				body:
					request.method !== "GET" && request.body
						? JSON.stringify(request.body)
						: undefined,
			});

			const response = await auth.handler(req);

			reply.status(response.status);
			// Forward every header except Set-Cookie, which needs special handling:
			// Headers.forEach collapses multiple Set-Cookie values into one comma-
			// joined string and corrupts them. getSetCookie() returns them split.
			for (const [key, value] of response.headers.entries()) {
				if (key.toLowerCase() === "set-cookie") continue;
				reply.header(key, value);
			}
			for (const cookie of response.headers.getSetCookie()) {
				reply.header("set-cookie", cookie);
			}
			reply.send(response.body ? await response.text() : null);
		},
	});
}
