import { confirm, isCancel } from "@clack/prompts";
import { requireProfile, type ResolveOpts } from "../lib/config.js";
import { extractErrorMessage, fail, getStatus } from "../lib/errors.js";
import { createClient } from "../lib/http.js";
import { printJson } from "../lib/output.js";

interface Tag {
	id: string;
	name: string;
	color: string;
	workspace_id: string;
}

interface CommonOpts extends ResolveOpts {
	json?: boolean;
}

export interface TagsCreateOpts extends CommonOpts {
	name?: string;
	color?: string;
}

export interface TagsDeleteOpts extends CommonOpts {
	yes?: boolean;
}

function shouldEmitJson(opts: CommonOpts): boolean {
	return opts.json ?? !process.stdout.isTTY;
}

export async function tagsListCommand(opts: CommonOpts): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: Tag[] };
	try {
		res = await client.ws<{ data: Tag[] }>("/tags");
	} catch (err) {
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	if (res.data.length === 0) {
		console.log("(no tags)");
		return;
	}

	for (const t of res.data) {
		console.log(`${t.id}  ${t.name}  ${t.color}`);
	}
}

export async function tagsCreateCommand(opts: TagsCreateOpts): Promise<void> {
	if (!opts.name || opts.name.trim().length === 0) {
		fail("--name is required (e.g. `--name prod`).");
	}
	if (!opts.color || opts.color.trim().length === 0) {
		fail('--color is required (e.g. `--color "#aabbcc"`).');
	}

	const profile = await requireProfile(opts);
	const client = createClient(profile);

	let res: { data: Tag };
	try {
		res = await client.ws<{ data: Tag }>("/tags", {
			method: "POST",
			body: { name: opts.name.trim(), color: opts.color.trim() },
		});
	} catch (err) {
		if (getStatus(err) === 403) {
			fail(
				"Creating tags requires a personal access token (API keys can't write).",
			);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson(res, { json: opts.json });
		return;
	}

	console.log(`Created tag ${res.data.id} (${res.data.name}, ${res.data.color}).`);
}

export async function tagsDeleteCommand(
	tagId: string,
	opts: TagsDeleteOpts,
): Promise<void> {
	const profile = await requireProfile(opts);
	const client = createClient(profile);

	const skipPrompt = opts.yes || !process.stdout.isTTY || opts.json;
	if (!skipPrompt) {
		const ok = await confirm({
			message: `Delete tag ${tagId}? This unlinks it from every agent that uses it.`,
			initialValue: false,
		});
		if (isCancel(ok) || !ok) {
			console.log("Aborted.");
			return;
		}
	}

	try {
		await client.ws(`/tags/${tagId}`, { method: "DELETE" });
	} catch (err) {
		const status = getStatus(err);
		if (status === 403) {
			fail(
				"Deleting tags requires a personal access token (API keys can't write).",
			);
		}
		if (status === 404) {
			fail(`Tag "${tagId}" not found.`);
		}
		fail(extractErrorMessage(err));
	}

	if (shouldEmitJson(opts)) {
		printJson({ data: { id: tagId, deleted: true } }, { json: opts.json });
		return;
	}

	console.log(`Deleted tag ${tagId}.`);
}
