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
import { cachedQuery } from "../lib/cache.js";

export async function registerRunRoute(fastify: FastifyInstance) {
	fastify.post("/api/v1/run", {
		schema: {
			tags: ["Run"],
			summary: "Run an agent",
			description: "Execute an agent with optional streaming, variable substitution, overrides, extra messages, and custom tools.",
			body: {
				type: "object" as const,
				required: ["agent_id"],
				properties: {
					agent_id: { type: "string" as const, description: "The agent to run" },
					environment: { type: "string" as const, enum: ["staging", "production"], default: "production", description: "Which deployed version to use" },
					variables: { type: "object" as const, additionalProperties: { type: "string" as const }, description: "Key-value pairs for variable substitution in agent messages" },
					stream: { type: "boolean" as const, default: false, description: "Whether to stream the response as SSE" },
					overrides: {
						type: "object" as const,
						description: "Runtime overrides for model, tokens, temperature, etc.",
						properties: {
							model: {
								type: "object" as const,
								properties: {
									provider_id: { type: "string" as const },
									name: { type: "string" as const },
								},
							},
							maxOutputTokens: { type: "number" as const },
							temperature: { type: "number" as const },
							maxStepCount: { type: "number" as const },
							providerOptions: { type: "object" as const, additionalProperties: true },
						},
					},
					extra_messages: { type: "array" as const, items: { type: "object" as const, additionalProperties: true }, description: "Additional messages appended after agent messages" },
					extra_tools: {
						type: "array" as const,
						description: "Custom tools to add to the agent",
						items: {
							type: "object" as const,
							required: ["title", "description"],
							properties: {
								title: { type: "string" as const },
								description: { type: "string" as const },
								inputSchema: { type: "object" as const, additionalProperties: true },
							},
						},
					},
					mcp_options: { type: "object" as const, additionalProperties: true, description: "Per-MCP-server options (e.g. custom headers)" },
				},
			},
			response: {
				200: {
					description: "Non-streaming response",
					type: "object" as const,
					properties: {
						text: { type: "string" as const },
						messages: { type: "array" as const, items: { type: "object" as const, additionalProperties: true } },
					},
				},
				400: { type: "object" as const, properties: { message: { type: "string" as const } } },
				404: { type: "object" as const, properties: { message: { type: "string" as const } } },
				500: { type: "object" as const, properties: { message: { type: "string" as const } } },
			},
		},
		handler: async (request, reply) => {
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
			mcp_options,
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
			mcp_options?: Record<string, { headers?: Record<string, string> }>;
		};

		// Validate request body
		if (!agent_id) {
			return reply.code(400).send({ message: "agent_id is required" });
		}

		const { workspaceId } = request;

		// Get agent with its deployed version IDs, scoped to the authenticated workspace
		const agent = await cachedQuery(
			`agent:${agent_id}:${workspaceId}`,
			30_000, // 30s TTL — short to pick up new deploys quickly
			async () => {
				const { data, error } = await supabase
					.from("agents")
					.select("staging_version_id, production_version_id, workspace_id")
					.eq("id", agent_id)
					.eq("workspace_id", workspaceId)
					.single();
				if (error || !data) return null;
				return data;
			},
		);

		if (!agent) {
			return reply.code(404).send({ message: "Agent not found" });
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

		// Fetch the version data (versions are immutable, cache aggressively)
		const version = await cachedQuery(
			`version:${versionId}`,
			600_000, // 10 min TTL — versions are immutable once created
			async () => {
				const { data, error } = await supabase
					.from("agent_versions")
					.select("*")
					.eq("id", versionId)
					.single();
				if (error || !data) return null;
				return data;
			},
		);

		if (!version) {
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
				prepareProviderAndMessages(data, variables, environment),
				prepareMCPServers(data, environment, mcp_options),
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
							workspace_id: workspaceId,
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
							cost: calculateModelCost(
								typeof model === "string" ? model : model.modelId,
								totalUsage,
							),
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
							workspace_id: workspaceId,
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
					workspace_id: workspaceId,
					version_id: version.id,
					created_at: new Date(startTime).toISOString(),
					is_error: false,
					is_test: false,
					is_stream: false,
					pre_processing_time: preProcessingTime,
					first_token_time: Date.now() - preProcessingTime - startTime,
					response_time: 0,
					tokens: totalUsage.totalTokens,
					cost: calculateModelCost(
						typeof model === "string" ? model : model.modelId,
						totalUsage,
					),
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
					workspace_id: workspaceId,
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
		},
	});
}
