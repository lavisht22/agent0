import { FetchError } from "ofetch";

export function extractErrorMessage(err: unknown): string {
	if (err instanceof FetchError) {
		const status = err.statusCode ?? err.response?.status;
		const body = err.data as { message?: string } | undefined;
		if (body?.message) {
			return status ? `${status}: ${body.message}` : body.message;
		}
		if (status) return `HTTP ${status}`;
		return err.message;
	}
	if (err instanceof Error) return err.message;
	return String(err);
}

export function getStatus(err: unknown): number | undefined {
	if (err instanceof FetchError) {
		return err.statusCode ?? err.response?.status;
	}
	return undefined;
}

export function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
