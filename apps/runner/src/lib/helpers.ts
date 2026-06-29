import { ReadableStream } from "node:stream/web";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { mcps, providers } from "@repo/database";
import {
	jsonSchema,
	type LanguageModel,
	type ModelMessage,
	type streamText,
	type Tool,
	type ToolSet,
	wrapLanguageModel,
} from "ai";
import { eq } from "drizzle-orm";
import { cachedQuery } from "./cache.js";
import { decryptSecret } from "./crypto.js";
import {
	bedrockCacheMiddleware,
	vertexAnthropicCacheMiddleware,
} from "./middleware.js";
import { db } from "./pg.js";
import { getAIProvider } from "./providers.js";
import { runLogStore } from "./storage.js";
import type {
	Environment,
	MCPConfig,
	MCPOptions,
	VersionData,
} from "./types.js";
import { applyVariablesToMessages } from "./variables.js";

// Falls back to production when no staging override is configured.
const pickEncrypted = (
	row: { encrypted_data_production: unknown; encrypted_data_staging: unknown },
	environment: Environment,
): string => {
	if (environment === "staging" && row.encrypted_data_staging) {
		return row.encrypted_data_staging as string;
	}
	return row.encrypted_data_production as string;
};

export const resolveProviderModel = async (
	data: VersionData,
	environment: Environment,
) => {
	const { model } = data;

	const { provider, aiProvider } = await cachedQuery(
		`provider-resolved:${model.provider_id}:${environment}`,
		300_000, // 5 min TTL — credentials change rarely
		async () => {
			const [row] = await db
				.select({
					type: providers.type,
					encrypted_data_production: providers.encrypted_data_production,
					encrypted_data_staging: providers.encrypted_data_staging,
				})
				.from(providers)
				.where(eq(providers.id, model.provider_id))
				.limit(1);
			if (!row) {
				throw new Error(`Provider not found: ${model.provider_id}`);
			}

			const decrypted = decryptSecret(pickEncrypted(row, environment));
			const config = JSON.parse(decrypted);
			const resolved = getAIProvider(row.type, config);

			if (!resolved) {
				throw new Error(`Unsupported provider type: ${row.type}`);
			}

			return { provider: row, aiProvider: resolved };
		},
	);

	const baseModel = aiProvider(model.name);
	const cacheMiddleware =
		provider.type === "anthropic-vertex"
			? vertexAnthropicCacheMiddleware
			: provider.type === "bedrock"
				? bedrockCacheMiddleware
				: null;
	const wrappedModel = cacheMiddleware
		? wrapLanguageModel({ model: baseModel, middleware: cacheMiddleware })
		: baseModel;

	return {
		model: wrappedModel as LanguageModel,
		provider,
	};
};

export const applyMessageVariables = (
	data: VersionData,
	variables: Record<string, string>,
): ModelMessage[] =>
	JSON.parse(
		applyVariablesToMessages(JSON.stringify(data.messages), variables),
	) as ModelMessage[];

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type Tools = Awaited<ReturnType<MCPClient["tools"]>>;

export const prepareMCPServers = async (
	data: VersionData,
	environment: Environment,
	mcpOptions?: Record<string, MCPOptions>,
) => {
	const { tools } = data;

	if (!tools || tools.length === 0) {
		return { tools: {}, closeAll: () => {} };
	}

	const mcpTools = tools.filter(
		(tool) => tool.type === "mcp" || !("type" in tool),
	);
	const customTools = tools.filter((tool) => tool.type === "custom");

	const mcp_ids: Set<string> = new Set();
	mcpTools.forEach((tool) => {
		// Tolerates both old (no type) and new (type: "mcp") tool shapes.
		const mcpTool = tool as { mcp_id: string; name: string };
		if (mcpTool.mcp_id) {
			mcp_ids.add(mcpTool.mcp_id);
		}
	});

	const servers: Record<string, { client: MCPClient; tools: Tools }> = {};

	if (mcp_ids.size > 0) {
		const mcpIds = Array.from(mcp_ids);
		const mcpRows = await Promise.all(
			mcpIds.map((id) =>
				cachedQuery(`mcp:${id}`, 300_000, async () => {
					const [row] = await db
						.select({
							id: mcps.id,
							encrypted_data_production: mcps.encrypted_data_production,
							encrypted_data_staging: mcps.encrypted_data_staging,
						})
						.from(mcps)
						.where(eq(mcps.id, id))
						.limit(1);
					if (!row) throw new Error(`Failed to fetch MCP server ${id}`);
					return row;
				}),
			),
		);

		if (!mcpRows.length) {
			throw new Error("Failed to fetch MCP servers");
		}

		await Promise.all(
			mcpRows.map(async (mcp) => {
				const config: MCPConfig = await cachedQuery(
					`mcp-config:${mcp.id}:${environment}`,
					300_000,
					async () => {
						const decrypted = decryptSecret(pickEncrypted(mcp, environment));
						return JSON.parse(decrypted) as MCPConfig;
					},
				);
				// Deep clone since we may mutate headers below.
				const mcpConfig: MCPConfig = JSON.parse(JSON.stringify(config));

				if (mcpOptions?.[mcp.id]?.headers) {
					mcpConfig.transport.headers = {
						...mcpConfig.transport.headers,
						...mcpOptions[mcp.id].headers,
					};
				}

				const mcpClient = await createMCPClient(mcpConfig);
				const tools = await mcpClient.tools();
				servers[mcp.id] = { client: mcpClient, tools };
			}),
		);
	}

	const closeAll = () => {
		Object.values(servers).forEach(({ client }) => {
			client.close();
		});
	};

	const selectedMcpTools = mcpTools.map((tool) => {
		const mcpTool = tool as { mcp_id: string; name: string };
		if (!servers[mcpTool.mcp_id]) {
			throw new Error(`MCP server not found for MCP ID: ${mcpTool.mcp_id}`);
		}

		const selectedTool = Object.entries(servers[mcpTool.mcp_id].tools).find(
			([name]) => name === mcpTool.name,
		);

		if (!selectedTool) {
			throw new Error(
				`Tool ${mcpTool.name} not found for MCP ID: ${mcpTool.mcp_id}`,
			);
		}

		return selectedTool;
	});

	const selectedCustomTools = customTools.map((tool) => {
		const customTool = tool as {
			type: "custom";
			title: string;
			description: string;
			inputSchema?: Record<string, unknown>;
		};

		const toolDefinition: Tool = {
			title: customTool.title,
			description: customTool.description,
			inputSchema: jsonSchema(tool.inputSchema || {}),
		};

		return [customTool.title, toolDefinition] as const;
	});

	const toolSet: Tools = Object.fromEntries([
		...selectedMcpTools,
		...selectedCustomTools,
	]);

	return { tools: toolSet, closeAll };
};

/** Keep-alive pings prevent connection timeouts during long LLM thinking. */
export const createSSEStream = (
	result: Awaited<ReturnType<typeof streamText>>,
) => {
	const encoder = new TextEncoder();
	const PING_INTERVAL_MS = 5000;

	return new ReadableStream({
		async start(controller) {
			// SSE comments (lines starting with `:`) are ignored by clients but keep
			// the connection alive.
			const pingInterval = setInterval(() => {
				try {
					const timestamp = Date.now();
					controller.enqueue(encoder.encode(`: ping ${timestamp}\r\n\r\n`));
				} catch {
					// Controller may be closed.
				}
			}, PING_INTERVAL_MS);

			let downstreamClosed = false;
			try {
				for await (const part of result.fullStream) {
					if (downstreamClosed) break;
					try {
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(part)}\r\n\r\n`),
						);
					} catch {
						// Client disconnected and Fastify tore down the controller. Stop
						// iterating; the route's abort handler stops the AI SDK.
						downstreamClosed = true;
						break;
					}
				}
			} catch (err) {
				if (!downstreamClosed) {
					console.error("Streaming error", err);
					try {
						controller.error(err);
					} catch {
						// Already closed.
					}
				}
			} finally {
				clearInterval(pingInterval);
				if (!downstreamClosed) {
					try {
						controller.close();
					} catch {
						// Already closed.
					}
				}
			}
		},
	});
};

const READ_SKILL_TOOL_NAME = "read_skill";

type RuntimeSkill = { name: string; description: string; body: string };

const isRuntimeSkill = (s: unknown): s is RuntimeSkill =>
	typeof s === "object" &&
	s !== null &&
	typeof (s as { name?: unknown }).name === "string" &&
	typeof (s as { description?: unknown }).description === "string" &&
	typeof (s as { body?: unknown }).body === "string";

export const prepareSkills = (data: VersionData) => {
	const rawSkills = data.skills;

	if (!rawSkills || rawSkills.length === 0) {
		return { systemAddendum: "", skillTools: {} as ToolSet };
	}

	// Defensive filter: tolerate malformed entries from in-flight schema changes.
	const validSkills = rawSkills.filter(isRuntimeSkill);

	if (validSkills.length === 0) {
		return { systemAddendum: "", skillTools: {} as ToolSet };
	}

	const catalog = validSkills
		.map((s) => `- ${s.name}: ${s.description}`)
		.join("\n");

	const systemAddendum = `You have access to the following skills. If a skill is relevant to the user's request, call \`${READ_SKILL_TOOL_NAME}\` with its name to load the full instructions before acting.\n\n${catalog}`;

	const bodyByName = new Map(validSkills.map((s) => [s.name, s.body]));
	const availableNames = validSkills.map((s) => s.name).join(", ");

	const readSkillTool: Tool = {
		description:
			"Read the full instructions for a skill by name. Returns the markdown body of the skill. Available skill names are listed in the system prompt.",
		inputSchema: jsonSchema({
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "The exact name of the skill to read.",
				},
			},
			required: ["name"],
		}),
		execute: async (input: unknown) => {
			const name = (input as { name?: string })?.name;
			if (!name) {
				return `Error: missing required "name" parameter. Available skills: ${availableNames}`;
			}
			const body = bodyByName.get(name);
			if (!body) {
				return `Error: skill "${name}" not found. Available skills: ${availableNames}`;
			}
			return body;
		},
	};

	return {
		systemAddendum,
		skillTools: { [READ_SKILL_TOOL_NAME]: readSkillTool } as ToolSet,
	};
};

/** Merge the skill catalog into the leading system message, or prepend one. */
export const applySkillCatalog = (
	messages: ModelMessage[],
	systemAddendum: string,
): ModelMessage[] => {
	if (!systemAddendum) return messages;

	const first = messages[0];
	if (first && first.role === "system") {
		const existingContent =
			typeof first.content === "string"
				? first.content
				: JSON.stringify(first.content);
		const merged: ModelMessage = {
			...first,
			content: existingContent
				? `${existingContent}\n\n${systemAddendum}`
				: systemAddendum,
		};
		return [merged, ...messages.slice(1)];
	}

	const systemMessage: ModelMessage = {
		role: "system",
		content: systemAddendum,
	};
	return [systemMessage, ...messages];
};

export const uploadRunData = async (id: string, data: unknown) => {
	await runLogStore.put(id, data);
};
