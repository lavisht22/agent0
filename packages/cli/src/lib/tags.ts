import type { ApiClient } from "./http.js";
import { fail } from "./errors.js";

export interface Tag {
	id: string;
	name: string;
	color: string;
	workspace_id: string;
}

interface TagsResponse {
	data: Tag[];
}

let cachedTags: Tag[] | null = null;

async function fetchTags(client: ApiClient): Promise<Tag[]> {
	if (cachedTags) return cachedTags;
	const res = await client.ws<TagsResponse>("/tags");
	cachedTags = res.data;
	return cachedTags;
}

export async function resolveTagNames(
	client: ApiClient,
	names: string[],
): Promise<string[]> {
	if (names.length === 0) return [];
	const tags = await fetchTags(client);

	const byName = new Map<string, Tag[]>();
	for (const tag of tags) {
		const existing = byName.get(tag.name) ?? [];
		existing.push(tag);
		byName.set(tag.name, existing);
	}

	const resolvedIds: string[] = [];
	const unknown: string[] = [];
	const ambiguous: string[] = [];

	for (const name of names) {
		const matches = byName.get(name);
		if (!matches || matches.length === 0) {
			unknown.push(name);
		} else if (matches.length > 1) {
			ambiguous.push(name);
		} else {
			resolvedIds.push(matches[0].id);
		}
	}

	if (unknown.length > 0) {
		fail(
			`Unknown tag${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Run \`agent0 tags list\` to see available tags.`,
		);
	}
	if (ambiguous.length > 0) {
		fail(
			`Tag name${ambiguous.length > 1 ? "s" : ""} matched multiple tags: ${ambiguous.join(", ")}. Pass tag IDs instead — duplicate names are ambiguous.`,
		);
	}

	return resolvedIds;
}

export function normalizeStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return [value];
	return [];
}
