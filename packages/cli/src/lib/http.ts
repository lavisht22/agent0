import { type $Fetch, FetchError, ofetch } from "ofetch";

export interface ClientOpts {
	url: string;
	token: string;
	workspace_id: string;
}

export interface ApiClient {
	ws: $Fetch;
	api: $Fetch;
}

export function createClient(opts: ClientOpts): ApiClient {
	const base = opts.url.replace(/\/$/, "");
	const isPat = opts.token.startsWith("agent0_pat_");
	// PATs travel on their own `x-pat` header; machine API keys on `x-api-key`.
	const headers: Record<string, string> = isPat
		? { "x-pat": opts.token }
		: { "x-api-key": opts.token };

	return {
		ws: ofetch.create({
			baseURL: `${base}/api/v1/workspaces/${opts.workspace_id}`,
			headers,
		}),
		api: ofetch.create({
			baseURL: `${base}/api/v1`,
			headers,
		}),
	};
}

export { FetchError };
