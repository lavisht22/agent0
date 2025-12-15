import {
	generateText,
	type ModelMessage,
	Output,
	stepCountIs,
	streamText,
	type ToolSet,
} from "ai";
import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import {
	createSSEStream,
	insertRun,
	prepareMCPServers,
	prepareProviderAndMessages,
} from "../lib/helpers.js";
import type { ProviderOptions, RunData, VersionData } from "../lib/types.js";

export async function registerRunRoute(fastify: FastifyInstance) {
	fastify.post("/api/v1/run", async (request, reply) => {
		const startTime = Date.now();

		const runData: RunData = {
			metrics: {
				preProcessingTime: 0,
				firstTokenTime: 0,
				responseTime: 0,
			},
		};

		const {
			agent_id,
			variables = {},
			stream = false,
			overrides,
			extra_messages,
		} = request.body as {
			agent_id: string;
			variables?: Record<string, string>;
			stream?: boolean;
			overrides?: {
				model?: {
					provider_id?: string;
					name?: string;
				};
				maxOutputTokens?: number;
				temperature?: number;
				maxStepCount?: number;
				providerOptions?: ProviderOptions;
			};
			extra_messages?: ModelMessage[];
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

		// Get agent and verify it belongs to the same workspace
		const { data: agent, error: agentError } = await supabase
			.from("agents")
			.select("workspaces(id, api_keys(id, key)), versions(*)")
			.eq("id", agent_id)
			.eq("versions.is_deployed", true)
			.single();

		if (agentError || !agent) {
			return reply.code(404).send({ message: "Agent not found" });
		}

		// Verify workspace access
		if (!agent.workspaces.api_keys.map((ak) => ak.key).includes(apiKey)) {
			return reply.code(403).send({ message: "Access denied" });
		}

		if (agent.versions.length === 0) {
			return reply
				.code(404)
				.send({ message: "No deployed version found for this agent" });
		}

		const version = agent.versions[0];
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

			runData.request = { ...data, messages: finalMessages, stream, overrides };
			runData.metrics.preProcessingTime = Date.now() - startTime;

			if (stream) {
				// Track if stream completed normally (via onFinish or onError)
				let streamCompleted = false;

				const controller = new 	AbortController();

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
						if (runData.metrics.firstTokenTime === 0) {
							runData.metrics.firstTokenTime =
								Date.now() - runData.metrics.preProcessingTime - startTime;
						}
					},
					
					onFinish: async ({ steps }) => {
						streamCompleted = true;
						closeAll();

						runData.metrics.responseTime =
							Date.now() - runData.metrics.preProcessingTime - startTime;
						runData.steps = steps;
						await insertRun(
							agent.workspaces.id,
							version.id,
							runData,
							startTime,
							false,
							false,
						);
					},
					onError: async ({ error }) => {
						streamCompleted = true;
						closeAll();

						if (runData.metrics.firstTokenTime === 0) {
							runData.metrics.firstTokenTime =
								Date.now() - runData.metrics.preProcessingTime - startTime;
						}
						runData.metrics.responseTime =
							Date.now() - runData.metrics.preProcessingTime - startTime;

						runData.error = {
							name: error instanceof Error ? error.name : "UnknownError",
							message:
								error instanceof Error ? error.message : "Unknown error occured.",
							cause:
								error instanceof Error
									? (error as Error & { cause?: unknown }).cause
									: undefined,
						};
						await insertRun(
							agent.workspaces.id,
							version.id,
							runData,
							startTime,
							true,
							false,
						);
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

				const { response, text, steps } = result;
				runData.steps = steps;

				runData.metrics.firstTokenTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;
				runData.metrics.responseTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;

				await insertRun(
					agent.workspaces.id,
					version.id,
					runData,
					startTime,
					false,
					false,
				);

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

				runData.metrics.firstTokenTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;
				runData.metrics.responseTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;

				await insertRun(
					agent.workspaces.id,
					version.id,
					runData,
					startTime,
					true,
					false,
				);

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
