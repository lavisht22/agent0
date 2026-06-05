import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * better-auth client. The session is an httpOnly cookie (Phase 2 step 9) — the
 * token never touches JS, so there is nothing here to store or read. The browser
 * is same-origin with the runner (prod serves the SPA; dev proxies through Vite),
 * so the cookie flows on every request with no CORS involvement.
 */
export const authClient = createAuthClient({
	baseURL: window.location.origin,
	plugins: [emailOTPClient()],
	fetchOptions: {
		// Send the session cookie. Same-origin, so this is effectively the default,
		// but we set it explicitly.
		credentials: "include",
	},
});

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

// Because the session cookie is httpOnly, JS can't synchronously know whether
// the user is logged in — it has to ask the server. We cache the answer for the
// app's lifetime so route guards don't refetch on every navigation. `undefined`
// means "not yet loaded"; `null` means "loaded, not authenticated".
let cachedSession: SessionData | undefined;

/** Resolve the session, hitting the server once and caching the result. */
export async function getCachedSession(force = false): Promise<SessionData> {
	if (cachedSession === undefined || force) {
		const { data } = await authClient.getSession();
		cachedSession = data ?? null;
	}
	return cachedSession;
}

/** Drop the cache so the next `getCachedSession` refetches (after login/logout). */
export function invalidateSession(): void {
	cachedSession = undefined;
}
