import { ReadableStream } from "node:stream/web";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import type { ModelMessage, streamText } from "ai";
import { supabase } from "./db.js";
import { decryptMessage } from "./openpgp.js";
import { getAIProvider } from "./providers.js";
import type { MCPConfig, VersionData } from "./types.js";
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
		model: aiProvider(model.name),
		provider,
		processedMessages,
	};
};

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type Tools = Awaited<ReturnType<MCPClient["tools"]>>;

export const prepareMCPServers = async (data: VersionData) => {
	const { tools } = data;

	if (!tools || tools.length === 0) {
		return { tools: {}, closeAll: () => {} };
	}

	const mcp_ids: Set<string> = new Set();
	tools.forEach((tool) => {
		mcp_ids.add(tool.mcp_id);
	});

	const { data: mcps } = await supabase
		.from("mcps")
		.select("*")
		.in("id", Array.from(mcp_ids));

	if (!mcps) {
		throw new Error("Failed to fetch MCP servers");
	}

	const servers: Record<string, { client: MCPClient; tools: Tools }> = {};

	await Promise.all(
		mcps.map(async (mcp) => {
			const decrypted = await decryptMessage(mcp.encrypted_data as string);
			const config: MCPConfig = JSON.parse(decrypted);
			const mcpClient = await createMCPClient(config);
			const tools = await mcpClient.tools();
			servers[mcp.id] = { client: mcpClient, tools };
		}),
	);

	const closeAll = () => {
		Object.values(servers).forEach(({ client }) => {
			client.close();
		});
	};

	const selectedTools = tools.map((tool) => {
		if (!servers[tool.mcp_id]) {
			throw new Error(`MCP server not found for MCP ID: ${tool.mcp_id}`);
		}

		const selectedTool = Object.entries(servers[tool.mcp_id].tools).find(
			([name]) => name === tool.name,
		);

		if (!selectedTool) {
			throw new Error(`Tool ${tool.name} not found for MCP ID: ${tool.mcp_id}`);
		}

		return selectedTool;
	});

	const toolSet: Tools = Object.fromEntries(selectedTools);

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
					controller.enqueue(
						encoder.encode(`: ping ${timestamp}\r\n\r\n`),
					);
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
