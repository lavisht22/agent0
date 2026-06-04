import {
	generateText,
	type ModelMessage,
	Output,
	type StepResult,
	stepCountIs,
	streamText,
	type ToolSet,
} from "ai";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { sumUsage } from "../lib/cost.js";
import { supabase } from "../lib/db.js";
import { createSSEStream } from "../lib/helpers.js";
import { prepareRun, RunPrepError, recordRun } from "../lib/run-agent.js";
import { hasScope, requireScope } from "../lib/scopes.js";
import type { RunOverrides } from "../lib/types.js";

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
		parent_run_id: {
			type: "string" as const,
			nullable: true,
			description:
				"ID of the run that invoked this one (agent-as-tool). Null for top-level runs.",
		},
		is_error: { type: "boolean" as const },
		is_test: { type: "boolean" as const },
		is_stream: { type: "boolean" as const, nullable: true },
		cost: { type: "number" as const, nullable: true },
		tokens: { type: "number" as const, nullable: true },
		response_time: { type: "number" as const },
		first_token_time: { type: "number" as const },
		pre_processing_time: { type: "number" as const },
		created_at: { type: "string" as const, format: "date-time" },
		// Null for runs whose agent version was never saved/since deleted
		// (null version_id) — surfaced via a left join, matching the web list.
		agent: { ...AgentRefSchema, nullable: true },
	},
};

const RunDetailSchema = {
	type: "object" as const,
	properties: {
		...RunSummarySchema.properties,
		workspace_id: { type: "string" as const },
		run_data: {
			type: "object" as const,
			nullable: true,
			additionalProperties: true,
			description:
				"Full run data including steps, request, and error details. Null if data has been cleaned up.",
		},
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
					agent_id: {
						type: "string" as const,
						description: "Filter by agent ID",
					},
					version_id: {
						type: "string" as const,
						description: "Filter by version ID",
					},
					parent_run_id: {
						type: "string" as const,
						description:
							"Filter by the run that invoked these (agent-as-tool children)",
					},
					status: {
						type: "string" as const,
						enum: ["success", "failed"],
						description: "Filter by run status",
					},
					is_test: {
						type: "string" as const,
						enum: ["true", "false"],
						description: "Filter by test runs",
					},
					start_date: {
						type: "string" as const,
						format: "date-time",
						description: "Filter runs created on or after this date (ISO 8601)",
					},
					end_date: {
						type: "string" as const,
						format: "date-time",
						description:
							"Filter runs created on or before this date (ISO 8601)",
					},
					page: {
						type: "string" as const,
						default: "1",
						description: "Page number",
					},
					limit: {
						type: "string" as const,
						default: "20",
						description: "Items per page (max 100)",
					},
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
			const { workspaceId } = request.params as { workspaceId: string };

			const {
				agent_id,
				version_id,
				parent_run_id,
				status,
				is_test,
				start_date,
				end_date,
				page = "1",
				limit = "20",
			} = request.query as {
				agent_id?: string;
				version_id?: string;
				parent_run_id?: string;
				status?: string;
				is_test?: string;
				start_date?: string;
				end_date?: string;
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(
				100,
				Math.max(1, Number.parseInt(limit, 10) || 20),
			);
			const offset = (pageNum - 1) * limitNum;

			// Left join by default so runs whose agent version is null (unsaved or
			// since-deleted agents) still appear — matching the web list. Switch to
			// an inner join only when filtering by agent_id, since filtering on an
			// embedded column requires the embed to be inner (PostgREST), and such a
			// filter inherently excludes null-version runs anyway.
			const versionEmbed = agent_id
				? "agent_versions!inner(id, agent_id, agents:agent_id(id, name))"
				: "agent_versions(id, agent_id, agents:agent_id(id, name))";

			let query = supabase
				.from("runs")
				.select(
					`id, version_id, parent_run_id, is_error, is_test, is_stream, cost, tokens, response_time, first_token_time, pre_processing_time, created_at, ${versionEmbed}`,
				)
				.eq("workspace_id", workspaceId);

			if (agent_id) {
				query = query.eq("agent_versions.agent_id", agent_id);
			}

			if (version_id) {
				query = query.eq("version_id", version_id);
			}

			if (parent_run_id) {
				query = query.eq("parent_run_id", parent_run_id);
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
			description:
				"Returns full run details including run data from storage. The run_data field will be null if the data has been cleaned up from storage.",
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
			const { workspaceId, runId } = request.params as {
				workspaceId: string;
				runId: string;
			};

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
			description:
				"Execute an agent with optional streaming, variable substitution, overrides, extra messages, and custom tools.",
			body: {
				type: "object" as const,
				required: ["agent_id"],
				properties: {
					agent_id: {
						type: "string" as const,
						description: "The agent to run",
					},
					environment: {
						type: "string" as const,
						enum: ["staging", "production"],
						default: "production",
						description: "Which deployed version to use",
					},
					variables: {
						type: "object" as const,
						additionalProperties: { type: "string" as const },
						description:
							"Key-value pairs for variable substitution in agent messages",
					},
					stream: {
						type: "boolean" as const,
						default: false,
						description: "Whether to stream the response as SSE",
					},
					overrides: {
						type: "object" as const,
						description:
							"Runtime overrides for model, tokens, temperature, etc.",
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
							providerOptions: {
								type: "object" as const,
								additionalProperties: true,
							},
						},
					},
					extra_messages: {
						type: "array" as const,
						items: { type: "object" as const, additionalProperties: true },
						description: "Additional messages appended after agent messages",
					},
					extra_tools: {
						type: "array" as const,
						description: "Custom tools to add to the agent",
						items: {
							type: "object" as const,
							required: ["title", "description"],
							properties: {
								title: { type: "string" as const },
								description: { type: "string" as const },
								inputSchema: {
									type: "object" as const,
									additionalProperties: true,
								},
							},
						},
					},
					mcp_options: {
						type: "object" as const,
						additionalProperties: true,
						description: "Per-MCP-server options (e.g. custom headers)",
					},
				},
			},
			response: {
				200: {
					description: "Non-streaming response",
					type: "object" as const,
					properties: {
						text: { type: "string" as const },
						messages: {
							type: "array" as const,
							items: { type: "object" as const, additionalProperties: true },
						},
					},
				},
				400: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				404: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				403: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				500: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
			},
		},
		handler: async (request, reply) => {
			const startTime = Date.now();
			// Generate up front so agents exposed as tools can link their sub-runs
			// back to this run as parent_run_id.
			const runId = nanoid();

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

			const { workspaceId } = request.params as { workspaceId: string };

			// Resolve the agent version, apply overrides/variables, and load the
			// provider model, tools, and skills. Throws RunPrepError (with an HTTP
			// code) when the agent or version can't be found.
			let prepared: Awaited<ReturnType<typeof prepareRun>>;
			try {
				prepared = await prepareRun({
					workspaceId,
					agentId: agent_id,
					environment,
					startTime,
					runId,
					variables,
					overrides,
					extraMessages: extra_messages,
					extraTools: extra_tools,
					mcpOptions: mcp_options,
				});
			} catch (err) {
				if (err instanceof RunPrepError) {
					return reply
						.code(err.code as 400 | 404 | 500)
						.send({ message: err.message });
				}
				throw err;
			}

			const {
				model,
				modelId,
				versionId: preparedVersionId,
				data,
				finalMessages,
				allTools,
				closeAll,
				preProcessingTime,
				runData,
			} = prepared;

			// Wrap all remaining logic in try-finally to ensure MCP clients are always closed
			try {
				const {
					maxOutputTokens,
					outputFormat,
					temperature,
					maxStepCount,
					providerOptions,
				} = data;

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
							// Another terminal callback (onError/onAbort) may have already
							// recorded this run.
							if (streamCompleted) return;
							// A cancelled run (e.g. with in-flight MCP tool calls) can fire
							// both onFinish and onAbort. Don't record it as a success —
							// defer to onAbort so it's deterministically saved as aborted.
							// Returning without setting the guard lets onAbort still run.
							if (controller.signal.aborted) return;
							streamCompleted = true;
							closeAll();

							runData.steps = steps;
							runData.totalUsage = totalUsage;

							await recordRun({
								workspaceId,
								id: runId,
								parentRunId: null,
								versionId: preparedVersionId,
								startTime,
								preProcessingTime,
								firstTokenTime: firstTokenTime as number,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								isError: false,
								isStream: true,
								modelId,
								usage: totalUsage,
								runData,
							});
						},
						onError: async ({ error }) => {
							if (streamCompleted) return;
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

							await recordRun({
								workspaceId,
								id: runId,
								parentRunId: null,
								versionId: preparedVersionId,
								startTime,
								preProcessingTime,
								firstTokenTime,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								isError: true,
								isStream: true,
								modelId,
								runData,
							});
						},
						onAbort: async ({ steps }) => {
							if (streamCompleted) return;
							streamCompleted = true;
							closeAll();

							if (!firstTokenTime) {
								firstTokenTime = Date.now() - preProcessingTime - startTime;
							}

							const totalUsage = sumUsage(steps);

							runData.steps = steps;
							runData.totalUsage = totalUsage;
							runData.error = {
								name: "AbortError",
								message: "Run aborted by client disconnect",
							};

							await recordRun({
								workspaceId,
								id: runId,
								parentRunId: null,
								versionId: preparedVersionId,
								startTime,
								preProcessingTime,
								firstTokenTime,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								isError: true,
								isStream: true,
								modelId,
								usage: totalUsage,
								runData,
							});
						},
					});

					// Abort the AI SDK call when the client disconnects. Under Fastify 5
					// the request-side 'close' event is unreliable during a streamed
					// response — only reply.raw emits 'close' on disconnect. We listen on
					// both as defense-in-depth; the streamCompleted guard prevents
					// double-handling.
					const handleClientClose = () => {
						if (!streamCompleted) {
							controller.abort();
							closeAll();
						}
					};
					reply.raw.on("close", handleClientClose);
					request.raw.on("close", handleClientClose);

					const streamResponse = createSSEStream(result);

					reply.headers({
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					});

					return reply.send(streamResponse);
				}

				// Non-streaming path
				const controller = new AbortController();
				let completed = false;
				const collectedSteps: StepResult<ToolSet>[] = [];

				// Same pattern as the streaming path — Fastify 5 only fires close on
				// reply.raw for response disconnects. Listen on both for safety.
				const handleClientClose = () => {
					if (!completed) {
						controller.abort();
					}
				};
				reply.raw.on("close", handleClientClose);
				request.raw.on("close", handleClientClose);

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
						abortSignal: controller.signal,
						onStepFinish: (step) => {
							collectedSteps.push(step as StepResult<ToolSet>);
						},
					});
					completed = true;

					const { response, text, steps, totalUsage } = result;
					runData.steps = steps;
					runData.totalUsage = totalUsage;

					await recordRun({
						workspaceId,
						id: runId,
						parentRunId: null,
						versionId: preparedVersionId,
						startTime,
						preProcessingTime,
						firstTokenTime: Date.now() - preProcessingTime - startTime,
						responseTime: 0,
						isError: false,
						isStream: false,
						modelId,
						usage: totalUsage,
						runData,
					});

					return reply.send({
						text,
						messages: response.messages,
					});
				} catch (error) {
					completed = true;

					if (controller.signal.aborted) {
						// Client disconnected — log as error with partial cost from
						// completed steps. Socket is gone, so don't try to send a reply.
						const totalUsage = sumUsage(collectedSteps);

						runData.steps = collectedSteps;
						runData.totalUsage = totalUsage;
						runData.error = {
							name: "AbortError",
							message: "Run aborted by client disconnect",
						};

						await recordRun({
							workspaceId,
							id: runId,
							parentRunId: null,
							versionId: preparedVersionId,
							startTime,
							preProcessingTime,
							firstTokenTime: Date.now() - preProcessingTime - startTime,
							responseTime: 0,
							isError: true,
							isStream: false,
							modelId,
							usage: totalUsage,
							runData,
						});
						return;
					}

					runData.error = {
						name: error instanceof Error ? error.name : "UnknownError",
						message:
							error instanceof Error ? error.message : "Unknown error occured.",
						cause:
							error instanceof Error
								? (error as Error & { cause?: unknown }).cause
								: undefined,
					};

					await recordRun({
						workspaceId,
						id: runId,
						parentRunId: null,
						versionId: preparedVersionId,
						startTime,
						preProcessingTime,
						firstTokenTime: Date.now() - preProcessingTime - startTime,
						responseTime: 0,
						isError: true,
						isStream: false,
						modelId,
						runData,
					});

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
