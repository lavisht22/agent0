import { ReadableStream } from "node:stream/web";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import {
	jsonSchema,
	type LanguageModel,
	type ModelMessage,
	type streamText,
	type Tool,
	type ToolSet,
} from "ai";
import { supabase } from "./db.js";
import { decryptMessage } from "./openpgp.js";
import { getAIProvider } from "./providers.js";
import type { Environment, MCPConfig, MCPOptions, VersionData } from "./types.js";
import { cachedQuery } from "./cache.js";
import { applyVariablesToMessages } from "./variables.js";

// Pick the encrypted blob for the requested environment, falling back to
// production when no staging override is configured.
const pickEncrypted = (
	row: { encrypted_data_production: unknown; encrypted_data_staging: unknown },
	environment: Environment,
): string => {
	if (environment === "staging" && row.encrypted_data_staging) {
		return row.encrypted_data_staging as string;
	}
	return row.encrypted_data_production as string;
};

// Helper to prepare provider and messages - shared logic between generate and stream
export const prepareProviderAndMessages = async (
	data: VersionData,
	variables: Record<string, string>,
	environment: Environment,
) => {
	const { model, messages } = data;

	// Cache the entire provider pipeline: DB fetch + decryption + provider init
	const { provider, aiProvider } = await cachedQuery(
		`provider-resolved:${model.provider_id}:${environment}`,
		300_000, // 5 min TTL — credentials change rarely
		async () => {
			const { data, error } = await supabase
				.from("providers")
				.select("*")
				.eq("id", model.provider_id)
				.single();
			if (error) throw error;

			const decrypted = await decryptMessage(pickEncrypted(data, environment));
			const config = JSON.parse(decrypted);
			const resolved = getAIProvider(data.type, config);

			if (!resolved) {
				throw new Error(`Unsupported provider type: ${data.type}`);
			}

			return { provider: data, aiProvider: resolved };
		},
	);

	const processedMessages = JSON.parse(
		applyVariablesToMessages(JSON.stringify(messages), variables),
	) as ModelMessage[];

	return {
		model: aiProvider(model.name) as LanguageModel,
		provider,
		processedMessages,
	};
};

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

	// Separate MCP tools from custom tools
	const mcpTools = tools.filter(
		(tool) => tool.type === "mcp" || !("type" in tool),
	);
	const customTools = tools.filter((tool) => tool.type === "custom");

	// Collect unique MCP IDs
	const mcp_ids: Set<string> = new Set();
	mcpTools.forEach((tool) => {
		// Handle both old format (without type) and new format (with type: "mcp")
		const mcpTool = tool as { mcp_id: string; name: string };
		if (mcpTool.mcp_id) {
			mcp_ids.add(mcpTool.mcp_id);
		}
	});

	const servers: Record<string, { client: MCPClient; tools: Tools }> = {};

	// Only fetch MCP servers if there are MCP tools
	if (mcp_ids.size > 0) {
		// Fetch each MCP config individually so they can be cached and deduplicated
		const mcpIds = Array.from(mcp_ids);
		const mcps = await Promise.all(
			mcpIds.map((id) =>
				cachedQuery(
					`mcp:${id}`,
					300_000, // 5 min TTL
					async () => {
						const { data, error } = await supabase
							.from("mcps")
							.select("*")
							.eq("id", id)
							.single();
						if (error || !data) throw new Error(`Failed to fetch MCP server ${id}`);
						return data;
					},
				),
			),
		);

		if (!mcps.length) {
			throw new Error("Failed to fetch MCP servers");
		}

		await Promise.all(
			mcps.map(async (mcp) => {
				// Cache the decrypted MCP config (DB row is already cached, this caches decryption)
				const config: MCPConfig = await cachedQuery(
					`mcp-config:${mcp.id}:${environment}`,
					300_000, // 5 min TTL
					async () => {
						const decrypted = await decryptMessage(pickEncrypted(mcp, environment));
						return JSON.parse(decrypted) as MCPConfig;
					},
				);
				// Deep clone since we may mutate headers below
				const mcpConfig: MCPConfig = JSON.parse(JSON.stringify(config));

				// Merge runtime custom headers from mcpOptions
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

	// Process MCP tools
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

// Helper to create SSE stream from AI result
// Includes a keep-alive ping mechanism to prevent connection timeouts during long LLM thinking periods
export const createSSEStream = (
	result: Awaited<ReturnType<typeof streamText>>,
) => {
	const encoder = new TextEncoder();
	const PING_INTERVAL_MS = 5000; // Send ping every 5 seconds

	return new ReadableStream({
		async start(controller) {
			// Set up ping interval to keep connection alive
			// SSE comments (lines starting with :) are ignored by clients but keep the connection alive
			const pingInterval = setInterval(() => {
				try {
					const timestamp = Date.now();
					controller.enqueue(encoder.encode(`: ping ${timestamp}\r\n\r\n`));
				} catch {
					// Controller may be closed, ignore errors
				}
			}, PING_INTERVAL_MS);

			try {
				for await (const part of result.fullStream) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(part)}\r\n\r\n`),
					);
				}
			} catch (err) {
				console.error("Streaming error", err);
				controller.error(err);
			} finally {
				clearInterval(pingInterval);
				controller.close();
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

	// Defensive filter: tolerate malformed entries from any in-flight schema
	// changes (e.g. legacy string-ID references from the workspace-skill prototype).
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

// Append the skill-catalog addendum to the messages list. If a system message
// already exists at the top, append to its content; otherwise prepend a new
// system message. No-op when the addendum is empty.
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
	const jsonString = JSON.stringify(data);

	const { data: uploadData, error } = await supabase.storage
		.from("runs-data")
		.upload(`${id}`, jsonString, {
			contentType: "application/json",
		});

	if (error) {
		throw error;
	}

	return uploadData;
};
