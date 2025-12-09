import { ReadableStream } from "node:stream/web";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import type { Json } from "@repo/database";
import type { ModelMessage, streamText } from "ai";
import { nanoid } from "nanoid";
import { supabase } from "./db.js";
import { decryptMessage } from "./openpgp.js";
import { getAIProvider } from "./providers.js";
import type { MCPConfig, RunData, VersionData } from "./types.js";
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
export const createSSEStream = (
	result: Awaited<ReturnType<typeof streamText>>,
) => {
	const encoder = new TextEncoder();

	return new ReadableStream({
		async start(controller) {
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
				controller.close();
			}
		},
	});
};

export async function insertRun(
	workspace_id: string,
	version_id: string,
	data: RunData,
	start_time: number,
	is_error: boolean,
	is_test: boolean,
) {
	await supabase.from("runs").insert({
		id: nanoid(),
		workspace_id,
		version_id,
		data: data as unknown as Json,
		created_at: new Date(start_time).toISOString(),
		is_error,
		is_test,
	});
}
