import { ReadableStream } from "node:stream/web";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import {
	jsonSchema,
	type LanguageModel,
	type ModelMessage,
	type streamText,
	type Tool,
} from "ai";
import { supabase } from "./db.js";
import { decryptMessage } from "./openpgp.js";
import { getAIProvider } from "./providers.js";
import type { MCPConfig, MCPOptions, VersionData } from "./types.js";
import { applyVariablesToMessages } from "./variables.js";

// Helper to prepare provider and messages - shared logic between generate and stream
export const prepareProviderAndMessages = async (
	data: VersionData,
	variables: Record<string, string>,
) => {
	const { model, messages } = data;

	const { data: provider, error: providerError } = await supabase
		.from("providers")
		.select("*")
		.eq("id", model.provider_id)
		.single();

	if (providerError) {
		throw providerError;
	}

	const decrypted = await decryptMessage(provider.encrypted_data);

	const config = JSON.parse(decrypted);

	const aiProvider = getAIProvider(provider.type, config);

	if (!aiProvider) {
		throw new Error(`Unsupported provider type: ${provider.type}`);
	}

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
		const { data: mcps } = await supabase
			.from("mcps")
			.select("*")
			.in("id", Array.from(mcp_ids));

		if (!mcps) {
			throw new Error("Failed to fetch MCP servers");
		}

		await Promise.all(
			mcps.map(async (mcp) => {
				const decrypted = await decryptMessage(mcp.encrypted_data as string);
				const config: MCPConfig = JSON.parse(decrypted);

				// Merge runtime custom headers from mcpOptions
				if (mcpOptions?.[mcp.id]?.headers) {
					config.transport.headers = {
						...config.transport.headers,
						...mcpOptions[mcp.id].headers,
					};
				}

				const mcpClient = await createMCPClient(config);
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
