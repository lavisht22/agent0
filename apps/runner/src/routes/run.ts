import {
	generateText,
	type ModelMessage,
	Output,
	stepCountIs,
	streamText,
	type ToolSet,
} from "ai";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { calculateModelCost } from "../lib/cost.js";
import { supabase } from "../lib/db.js";
import {
	createSSEStream,
	prepareMCPServers,
	prepareProviderAndMessages,
	uploadRunData,
} from "../lib/helpers.js";
import type { RunData, RunOverrides, VersionData } from "../lib/types.js";

export async function registerRunRoute(fastify: FastifyInstance) {
	fastify.post("/api/v1/run", async (request, reply) => {
		const startTime = Date.now();

		const runData: RunData = {};

		const {
			agent_id,
			environment = "production",
			variables = {},
			stream = false,
			overrides,
			extra_messages,
			extra_tools,
		} = request.body as {
			agent_id: string;
			environment?: "staging" | "production";
			variables?: Record<string, string>;
			stream?: boolean;
			overrides?: RunOverrides;
			extra_messages?: ModelMessage[];
			extra_tools?: {
				title: string;
				description: string;
				inputSchema?: Record<string, unknown>;
			}[];
		};

		// Validate request body
		if (!agent_id) {
			return reply.code(400).send({ message: "agent_id is required" });
		}

		// Extract and validate API key from headers
		const apiKey = request.headers["x-api-key"] as string;

		if (!apiKey) {
			return reply.code(401).send({ message: "API key is required" });
		}

		// Get agent with its deployed version IDs and workspace info
		const { data: agent, error: agentError } = await supabase
			.from("agents")
			.select(
				"staging_version_id, production_version_id, workspaces(id, api_keys(id, key))",
			)
			.eq("id", agent_id)
			.single();

		if (agentError || !agent) {
			return reply.code(404).send({ message: "Agent not found" });
		}

		// Verify workspace access
		if (!agent.workspaces.api_keys.map((ak) => ak.key).includes(apiKey)) {
			return reply.code(403).send({ message: "Access denied" });
		}

		// Get the version ID for the requested environment
		const versionId =
			environment === "staging"
				? agent.staging_version_id
				: agent.production_version_id;

		if (!versionId) {
			return reply
				.code(404)
				.send({ message: `No ${environment} version found for this agent` });
		}

		// Fetch the version data
		const { data: version, error: versionError } = await supabase
			.from("versions")
			.select("*")
			.eq("id", versionId)
			.single();

		if (versionError || !version) {
			return reply
				.code(404)
				.send({ message: `No ${environment} version found for this agent` });
		}

		const data = version.data as VersionData;

		// Apply runtime overrides if provided
		if (overrides) {
			if (overrides.model?.provider_id)
				data.model.provider_id = overrides.model.provider_id;
			if (overrides.model?.name) data.model.name = overrides.model.name;
			if (overrides.maxOutputTokens !== undefined)
				data.maxOutputTokens = overrides.maxOutputTokens;
			if (overrides.temperature !== undefined)
				data.temperature = overrides.temperature;
			if (overrides.maxStepCount !== undefined)
				data.maxStepCount = overrides.maxStepCount;
			if (overrides.providerOptions)
				data.providerOptions = {
					...data.providerOptions,
					...overrides.providerOptions,
				};
		}

		// Merge extra_tools with existing tools
		if (extra_tools && extra_tools.length > 0) {
			const customTools = extra_tools.map((tool) => ({
				type: "custom" as const,
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}));
			data.tools = [...(data.tools || []), ...customTools];
		}

		const [{ model, processedMessages }, { tools, closeAll }] =
			await Promise.all([
				prepareProviderAndMessages(data, variables),
				prepareMCPServers(data),
			]);

		// Wrap all remaining logic in try-finally to ensure MCP clients are always closed
		try {
			const {
				maxOutputTokens,
				outputFormat,
				temperature,
				maxStepCount,
				providerOptions,
			} = data;

			// Append extra messages if provided (used as-is, no variable substitution)
			const finalMessages = extra_messages
				? [...processedMessages, ...extra_messages]
				: processedMessages;

			runData.request = { ...data, messages: finalMessages, overrides };
			const preProcessingTime = Date.now() - startTime;

			if (stream) {
				// Track if stream completed normally (via onFinish or onError)
				let streamCompleted = false;

				const controller = new AbortController();

				let firstTokenTime: number | null = null;

				const result = streamText({
					model,
					maxOutputTokens,
					temperature,
					stopWhen: stepCountIs(maxStepCount || 10),
					messages: finalMessages,
					tools: tools as ToolSet,
					output: outputFormat === "json" ? Output.json() : Output.text(),
					providerOptions,
					abortSignal: controller.signal,
					onChunk: () => {
						if (!firstTokenTime) {
							firstTokenTime = Date.now() - preProcessingTime - startTime;
						}
					},

					onFinish: async ({ steps, totalUsage }) => {
						streamCompleted = true;
						closeAll();

						runData.steps = steps;
						runData.totalUsage = totalUsage;

						const id = nanoid();
						await supabase.from("runs").insert({
							id,
							workspace_id: agent.workspaces.id,
							version_id: version.id,
							created_at: new Date(startTime).toISOString(),
							is_error: false,
							is_test: false,
							is_stream: true,
							pre_processing_time: preProcessingTime,
							first_token_time: firstTokenTime as number,
							response_time:
								Date.now() -
								(firstTokenTime || 0) -
								preProcessingTime -
								startTime,
							tokens: totalUsage.totalTokens,
							cost: calculateModelCost(model.modelId, totalUsage),
						});
						await uploadRunData(id, runData);
					},
					onError: async ({ error }) => {
						streamCompleted = true;
						closeAll();

						if (!firstTokenTime) {
							firstTokenTime = Date.now() - preProcessingTime - startTime;
						}

						runData.error = {
							name: error instanceof Error ? error.name : "UnknownError",
							message:
								error instanceof Error
									? error.message
									: "Unknown error occured.",
							cause:
								error instanceof Error
									? (error as Error & { cause?: unknown }).cause
									: undefined,
						};

						const id = nanoid();
						await supabase.from("runs").insert({
							id,
							workspace_id: agent.workspaces.id,
							version_id: version.id,
							created_at: new Date(startTime).toISOString(),
							is_error: true,
							is_test: false,
							is_stream: true,
							pre_processing_time: preProcessingTime,
							first_token_time: firstTokenTime,
							response_time:
								Date.now() -
								(firstTokenTime || 0) -
								preProcessingTime -
								startTime,
						});
						await uploadRunData(id, runData);
					},
				});

				// Handle client disconnect - clean up MCP clients if stream didn't complete
				request.raw.on("close", () => {
					if (!streamCompleted) {
						controller.abort();
						closeAll();
					}
				});

				const streamResponse = createSSEStream(result);

				reply.headers({
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});

				return reply.send(streamResponse);
			}

			// Non-streaming path
			try {
				const result = await generateText({
					model,
					maxOutputTokens,
					temperature,
					stopWhen: stepCountIs(maxStepCount || 10),
					messages: finalMessages,
					tools: tools as ToolSet,
					output: outputFormat === "json" ? Output.json() : Output.text(),
					providerOptions,
				});

				const { response, text, steps, totalUsage } = result;
				runData.steps = steps;
				runData.totalUsage = totalUsage;

				const id = nanoid();
				await supabase.from("runs").insert({
					id,
					workspace_id: agent.workspaces.id,
					version_id: version.id,
					created_at: new Date(startTime).toISOString(),
					is_error: false,
					is_test: false,
					is_stream: false,
					pre_processing_time: preProcessingTime,
					first_token_time: Date.now() - preProcessingTime - startTime,
					response_time: 0,
					tokens: totalUsage.totalTokens,
					cost: calculateModelCost(model.modelId, totalUsage),
				});
				await uploadRunData(id, runData);

				return reply.send({
					text,
					messages: response.messages,
				});
			} catch (error) {
				runData.error = {
					name: error instanceof Error ? error.name : "UnknownError",
					message:
						error instanceof Error ? error.message : "Unknown error occured.",
					cause:
						error instanceof Error
							? (error as Error & { cause?: unknown }).cause
							: undefined,
				};

				const id = nanoid();
				await supabase.from("runs").insert({
					id,
					workspace_id: agent.workspaces.id,
					version_id: version.id,
					created_at: new Date(startTime).toISOString(),
					is_error: true,
					is_test: false,
					is_stream: false,
					pre_processing_time: preProcessingTime,
					first_token_time: Date.now() - preProcessingTime - startTime,
					response_time: 0,
				});
				await uploadRunData(id, runData);

				return reply.code(500).send(error);
			}
		} finally {
			// Ensure MCP clients are always closed for non-streaming path
			// For streaming, this runs immediately after returning the stream,
			// but cleanup is handled by onFinish/onError/close handlers
			if (!stream) {
				closeAll();
			}
		}
	});
}
