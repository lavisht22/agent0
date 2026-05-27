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
	applyMessageVariables,
	applySkillCatalog,
	createSSEStream,
	prepareMCPServers,
	prepareSkills,
	resolveProviderModel,
	uploadRunData,
} from "../lib/helpers.js";
import type { RunData, RunOverrides, VersionData } from "../lib/types.js";
import { cachedQuery } from "../lib/cache.js";
import { hasScope, requireScope } from "../lib/scopes.js";

const AgentRefSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
	},
};

const RunSummarySchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		version_id: { type: "string" as const, nullable: true },
		is_error: { type: "boolean" as const },
		is_test: { type: "boolean" as const },
		is_stream: { type: "boolean" as const, nullable: true },
		cost: { type: "number" as const, nullable: true },
		tokens: { type: "number" as const, nullable: true },
		response_time: { type: "number" as const },
		first_token_time: { type: "number" as const },
		pre_processing_time: { type: "number" as const },
		created_at: { type: "string" as const, format: "date-time" },
		agent: AgentRefSchema,
	},
};

const RunDetailSchema = {
	type: "object" as const,
	properties: {
		...RunSummarySchema.properties,
		workspace_id: { type: "string" as const },
		run_data: { type: "object" as const, nullable: true, additionalProperties: true, description: "Full run data including steps, request, and error details. Null if data has been cleaned up." },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerRunsRoutes(fastify: FastifyInstance) {
	fastify.get("/runs", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "List runs",
			querystring: {
				type: "object" as const,
				properties: {
					agent_id: { type: "string" as const, description: "Filter by agent ID" },
					version_id: { type: "string" as const, description: "Filter by version ID" },
					status: { type: "string" as const, enum: ["success", "failed"], description: "Filter by run status" },
					is_test: { type: "string" as const, enum: ["true", "false"], description: "Filter by test runs" },
					start_date: { type: "string" as const, format: "date-time", description: "Filter runs created on or after this date (ISO 8601)" },
					end_date: { type: "string" as const, format: "date-time", description: "Filter runs created on or before this date (ISO 8601)" },
					page: { type: "string" as const, default: "1", description: "Page number" },
					limit: { type: "string" as const, default: "20", description: "Items per page (max 100)" },
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: RunSummarySchema },
						page: { type: "number" as const },
						limit: { type: "number" as const },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request;

			const {
				agent_id,
				version_id,
				status,
				is_test,
				start_date,
				end_date,
				page = "1",
				limit = "20",
			} = request.query as {
				agent_id?: string;
				version_id?: string;
				status?: string;
				is_test?: string;
				start_date?: string;
				end_date?: string;
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
			const offset = (pageNum - 1) * limitNum;

			let query = supabase
				.from("runs")
				.select("id, version_id, is_error, is_test, is_stream, cost, tokens, response_time, first_token_time, pre_processing_time, created_at, agent_versions!inner(id, agent_id, agents:agent_id(id, name))")
				.eq("workspace_id", workspaceId);

			if (agent_id) {
				query = query.eq("agent_versions.agent_id", agent_id);
			}

			if (version_id) {
				query = query.eq("version_id", version_id);
			}

			if (status === "success") {
				query = query.eq("is_error", false);
			} else if (status === "failed") {
				query = query.eq("is_error", true);
			}

			if (is_test === "true") {
				query = query.eq("is_test", true);
			} else if (is_test === "false") {
				query = query.eq("is_test", false);
			}

			if (start_date) {
				query = query.gte("created_at", start_date);
			}

			if (end_date) {
				query = query.lte("created_at", end_date);
			}

			query = query
				.order("created_at", { ascending: false })
				.range(offset, offset + limitNum - 1);

			const { data: runs, error } = await query;

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch runs" });
			}

			// Flatten the nested version/agent info
			const result = runs.map((run) => {
				const { agent_versions, ...rest } = run;
				return {
					...rest,
					agent: agent_versions?.agents,
				};
			});

			return reply.send({ data: result, page: pageNum, limit: limitNum });
		},
	});

	fastify.get("/runs/:runId", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "Get run details",
			description: "Returns full run details including run data from storage. The run_data field will be null if the data has been cleaned up from storage.",
			params: {
				type: "object" as const,
				properties: {
					runId: { type: "string" as const, description: "Run ID" },
				},
				required: ["runId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: RunDetailSchema,
					},
				},
				404: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request;
			const { runId } = request.params as { runId: string };

			const { data: run, error } = await supabase
				.from("runs")
				.select("*, agent_versions(id, agent_id, agents:agent_id(id, name))")
				.eq("id", runId)
				.eq("workspace_id", workspaceId)
				.single();

			if (error || !run) {
				return reply.code(404).send({ message: "Run not found" });
			}

			// Download run data (steps, request, error details, usage) from storage
			let runData = null;
			const { data: blob, error: storageError } = await supabase.storage
				.from("runs-data")
				.download(`${runId}`);

			if (!storageError && blob) {
				const text = await blob.text();
				runData = JSON.parse(text);
			}

			const { agent_versions, ...rest } = run;
			return reply.send({
				data: {
					...rest,
					agent: agent_versions?.agents,
					run_data: runData,
				},
			});
		},
	});

	fastify.post("/runs", {
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
				403: { type: "object" as const, properties: { message: { type: "string" as const } } },
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

		// Scope check (depends on body.agent_id, so done here rather than in a
		// preHandler).
		if (!hasScope(request.scopes, `agents:run:${agent_id}`)) {
			return reply
				.code(403)
				.send({ message: `Missing required scope: agents:run:${agent_id}` });
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

		const data = JSON.parse(JSON.stringify(version.data)) as VersionData;

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

		const processedMessages = applyMessageVariables(data, variables);
		const [
			{ model },
			{ tools, closeAll },
			{ systemAddendum, skillTools },
		] = await Promise.all([
			resolveProviderModel(data, environment),
			prepareMCPServers(data, environment, mcp_options),
			prepareSkills(data),
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

			// Inject the skills catalog into the system message (no-op when no
			// skills are attached) before appending any extra messages.
			const messagesWithSkills = applySkillCatalog(
				processedMessages,
				systemAddendum,
			);

			// Append extra messages if provided (used as-is, no variable substitution)
			const finalMessages = extra_messages
				? [...messagesWithSkills, ...extra_messages]
				: messagesWithSkills;

			// Skills win on name collision so the catalog's `read_skill` reference
			// always routes to the built-in handler.
			const allTools = { ...tools, ...skillTools };

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
					tools: allTools as ToolSet,
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
					tools: allTools as ToolSet,
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
