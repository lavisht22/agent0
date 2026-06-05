import { getSessionToken } from "./auth-client";

// In dev the web (:2222) and runner (:2223) are separate origins; in prod the
// runner serves the built SPA, so same-origin relative paths work.
const BASE_URL = import.meta.env.DEV ? "http://localhost:2223" : "";

/** Thrown for any non-2xx runner response. `status` is the HTTP status code. */
export class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
	/** JSON request body; serialized with JSON.stringify. */
	body?: unknown;
	/** Query string params; undefined/null values are omitted. */
	query?: Record<string, QueryValue>;
	signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
	// BASE_URL is absolute in dev and empty in prod, so resolve against the
	// current origin to get a valid URL object in both cases.
	const url = new URL(`${BASE_URL}${path}`, window.location.origin);

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null) {
				url.searchParams.set(key, String(value));
			}
		}
	}

	return url.toString();
}

async function request<T>(
	method: string,
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	// The runner authenticates browser callers via the better-auth session
	// bearer token, held in memory by auth-client (Phase 2).
	const token = getSessionToken();

	if (!token) {
		throw new ApiError("You must be logged in.", 401);
	}

	const response = await fetch(buildUrl(path, options.query), {
		method,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		signal: options.signal,
	});

	if (!response.ok) {
		// The runner returns errors as `{ message }`; fall back to the status text
		// for non-JSON bodies (e.g. a proxy 502).
		let message = response.statusText || `Request failed (${response.status})`;
		try {
			const json = (await response.json()) as { message?: string };
			if (json.message) message = json.message;
		} catch {
			// Non-JSON error body; keep the fallback message.
		}
		throw new ApiError(message, response.status);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

export const api = {
	get: <T>(path: string, options?: Omit<RequestOptions, "body">) =>
		request<T>("GET", path, options),
	post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		request<T>("POST", path, { ...options, body }),
	patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
		request<T>("PATCH", path, { ...options, body }),
	delete: <T>(path: string, options?: RequestOptions) =>
		request<T>("DELETE", path, options),
};
