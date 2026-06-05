import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// In dev the web (:2222) and runner (:2223) are separate origins; in prod the
// runner serves the built SPA, so the auth surface is same-origin. The runner
// mounts better-auth at /api/auth (the client's default basePath).
const BASE_URL = import.meta.env.DEV
	? "http://localhost:2223"
	: window.location.origin;

/**
 * In-memory bearer-token store. Deliberately NOT localStorage/sessionStorage:
 * a token kept only in a JS closure can't be lifted out of persistent storage
 * by an XSS payload, and it dies with the tab. The trade-off is that a full
 * page reload loses the token (there's no cookie either — the runner's CORS is
 * wildcard + bearer-only by design), so the user lands back on /auth. Durable
 * cross-reload sessions (refresh-token rotation) are Phase 2 step 9.
 */
let sessionToken: string | null = null;

export function getSessionToken(): string | null {
	return sessionToken;
}

export function setSessionToken(token: string | null): void {
	sessionToken = token;
}

export const authClient = createAuthClient({
	baseURL: BASE_URL,
	plugins: [emailOTPClient()],
	fetchOptions: {
		// The bearer plugin returns the session token in `set-auth-token` on any
		// authenticated response (OTP verify, getSession, …). Capture it into the
		// in-memory store so api-client can attach it as `Authorization: Bearer`.
		// (The runner exposes this header via CORS for the cross-origin dev case.)
		onSuccess(ctx) {
			const token = ctx.response.headers.get("set-auth-token");
			if (token) {
				setSessionToken(token);
			}
		},
		// Send the in-memory token on better-auth's own requests too.
		auth: {
			type: "Bearer",
			token: () => getSessionToken() ?? "",
		},
	},
});
