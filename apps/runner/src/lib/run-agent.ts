import {
	generateText,
	jsonSchema,
	type LanguageModel,
	type LanguageModelUsage,
	type ModelMessage,
	Output,
	type StepResult,
	stepCountIs,
	type Tool,
	type ToolSet,
} from "ai";
import { nanoid } from "nanoid";
import { cachedQuery } from "./cache.js";
import { calculateModelCost, sumUsage } from "./cost.js";
import { supabase } from "./db.js";
import {
	applyMessageVariables,
	applySkillCatalog,
	prepareMCPServers,
	prepareSkills,
	resolveProviderModel,
	uploadRunData,
} from "./helpers.js";
import type {
	AgentTool,
	Environment,
	MCPOptions,
	RunData,
	RunOverrides,
	VersionData,
} from "./types.js";

/**
 * Maximum length of the agent call chain (the top-level agent counts as 1).
 * Bounds runaway fan-out/recursion when agents are exposed as tools.
 */
const MAX_AGENT_DEPTH = 5;

/**
 * Build AI-SDK tools for any agents exposed as tools on a version. Each tool's
 * `execute` runs the referenced agent in-process via `runAgent`, passing the
 * model's free-form `prompt` as the sub-agent's input.
 *
 * `activeChain` is the list of agent IDs currently on the execution stack,
 * INCLUDING the agent that owns these tools. It guards two ways:
 *   - cycle: refuse to call an agent already in the chain (A → B → A);
 *   - depth: refuse once the chain reaches MAX_AGENT_DEPTH.
 * Guard failures are returned to the model as an error string rather than
 * thrown, so the calling agent can recover or report it.
 *
 * `abortSignal` from each tool call (forwarded by the SDK from the parent run)
 * is threaded into the sub-agent so cancelling the parent cancels children.
 */
const buildAgentTools = (
	agentTools: AgentTool[],
	workspaceId: string,
	activeChain: string[],
	parentRunId: string,
): ToolSet => {
	const toolSet: ToolSet = {};

	for (const agentTool of agentTools) {
		const tool: Tool = {
			description: agentTool.description,
			inputSchema: jsonSchema({
				type: "object",
				properties: {
					prompt: {
						type: "string",
						description: "The request to send to this agent.",
					},
				},
				required: ["prompt"],
			}),
			execute: async (input, { abortSignal }) => {
				if (activeChain.includes(agentTool.agent_id)) {
					return `Error: agent "${agentTool.name}" is already running in this call chain; refusing to call it recursively.`;
				}
				if (activeChain.length >= MAX_AGENT_DEPTH) {
					return `Error: maximum agent call depth (${MAX_AGENT_DEPTH}) reached; cannot call "${agentTool.name}".`;
				}

				const prompt = (input as { prompt?: string })?.prompt ?? "";

				try {
					const result = await runAgent({
						workspaceId,
						agentId: agentTool.agent_id,
						environment: agentTool.environment ?? "production",
						extraMessages: [{ role: "user", content: prompt }],
						abortSignal,
						callStack: activeChain,
						parentRunId,
					});
					return result.text;
				} catch (err) {
					return `Error running agent "${agentTool.name}": ${
						err instanceof Error ? err.message : "unknown error"
					}`;
				}
			},
		};

		toolSet[agentTool.name] = tool;
	}

	return toolSet;
};

/**
 * Error thrown by `prepareRun` when an agent/version can't be resolved. Carries
 * an HTTP status code so the route handler can map it to a response.
 */
export class RunPrepError extends Error {
	code: number;
	constructor(code: number, message: string) {
		super(message);
		this.name = "RunPrepError";
		this.code = code;
	}
}

type ExtraTool = {
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

export type PrepareRunOptions = {
	workspaceId: string;
	agentId: string;
	environment: Environment;
	startTime: number;
	/**
	 * The id this run will be recorded under. Known up front so agents exposed
	 * as tools can link their sub-runs back to it as `parent_run_id`.
	 */
	runId: string;
	variables?: Record<string, string>;
	overrides?: RunOverrides;
	extraMessages?: ModelMessage[];
	extraTools?: ExtraTool[];
	mcpOptions?: Record<string, MCPOptions>;
	/**
	 * Agent IDs already on the execution stack (ancestors of this run), NOT
	 * including `agentId` itself. Empty/undefined for a top-level run. Used to
	 * guard agent-as-tool recursion; see buildAgentTools.
	 */
	callStack?: string[];
};

export type PreparedRun = {
	model: LanguageModel;
	modelId: string;
	versionId: string;
	data: VersionData;
	finalMessages: ModelMessage[];
	allTools: ToolSet;
	closeAll: () => void;
	preProcessingTime: number;
	runData: RunData;
};

/**
 * Shared preprocessing for a run: resolve the agent's deployed version for the
 * environment, apply overrides, substitute variables, load the provider model,
 * MCP tools, and skills, and assemble the final message list + tool set.
 *
 * Throws `RunPrepError` (with an HTTP code) when the agent or version can't be
 * resolved. On success the caller owns `closeAll()` — it MUST be invoked once
 * the run finishes to release MCP clients.
 */
export const prepareRun = async (
	opts: PrepareRunOptions,
): Promise<PreparedRun> => {
	const {
		workspaceId,
		agentId,
		environment,
		startTime,
		runId,
		variables = {},
		overrides,
		extraMessages,
		extraTools,
		mcpOptions,
		callStack = [],
	} = opts;

	// Get agent with its deployed version IDs, scoped to the authenticated
	// workspace.
	const agent = await cachedQuery(
		`agent:${agentId}:${workspaceId}`,
		30_000, // 30s TTL — short to pick up new deploys quickly
		async () => {
			const { data, error } = await supabase
				.from("agents")
				.select("staging_version_id, production_version_id, workspace_id")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();
			if (error || !data) return null;
			return data;
		},
	);

	if (!agent) {
		throw new RunPrepError(404, "Agent not found");
	}

	const versionId =
		environment === "staging"
			? agent.staging_version_id
			: agent.production_version_id;

	if (!versionId) {
		throw new RunPrepError(
			404,
			`No ${environment} version found for this agent`,
		);
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
		throw new RunPrepError(
			404,
			`No ${environment} version found for this agent`,
		);
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
	if (extraTools && extraTools.length > 0) {
		const customTools = extraTools.map((tool) => ({
			type: "custom" as const,
			title: tool.title,
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));
		data.tools = [...(data.tools || []), ...customTools];
	}

	const processedMessages = applyMessageVariables(data, variables);
	const [{ model }, { tools, closeAll }, { systemAddendum, skillTools }] =
		await Promise.all([
			resolveProviderModel(data, environment),
			prepareMCPServers(data, environment, mcpOptions),
			prepareSkills(data),
		]);

	// Inject the skills catalog into the system message (no-op when no skills
	// are attached) before appending any extra messages.
	const messagesWithSkills = applySkillCatalog(
		processedMessages,
		systemAddendum,
	);

	// Append extra messages if provided (used as-is, no variable substitution)
	const finalMessages = extraMessages
		? [...messagesWithSkills, ...extraMessages]
		: messagesWithSkills;

	// Build tools for any agents exposed as tools. The active chain includes
	// this agent so a sub-agent can detect a cycle back to it (and to bound
	// depth). prepareMCPServers ignores "agent" tools, so they're handled here.
	const agentToolDefs = (data.tools ?? []).filter(
		(t): t is AgentTool => "type" in t && t.type === "agent",
	);
	const agentTools = buildAgentTools(
		agentToolDefs,
		workspaceId,
		[...callStack, agentId],
		runId,
	);

	// Skills win on name collision so the catalog's `read_skill` reference always
	// routes to the built-in handler.
	const allTools = { ...tools, ...agentTools, ...skillTools } as ToolSet;

	const runData: RunData = {};
	runData.request = { ...data, messages: finalMessages, overrides };

	const modelId = typeof model === "string" ? model : model.modelId;

	return {
		model,
		modelId,
		versionId,
		data,
		finalMessages,
		allTools,
		closeAll,
		preProcessingTime: Date.now() - startTime,
		runData,
	};
};

export type RecordRunOptions = {
	workspaceId: string;
	versionId: string | null;
	startTime: number;
	preProcessingTime: number;
	firstTokenTime: number;
	responseTime: number;
	isError: boolean;
	isStream: boolean;
	isTest?: boolean;
	modelId: string;
	usage?: LanguageModelUsage;
	runData: RunData;
	/**
	 * Pre-generated run id. Supply this when the id must be known before the run
	 * finishes (so sub-runs can reference it as their parent). Defaults to a
	 * fresh id.
	 */
	id?: string;
	/** Id of the run that invoked this one (agent-as-tool). Null for top-level. */
	parentRunId?: string | null;
};

/**
 * Persist a run row and upload its full run data. `tokens`/`cost` are only
 * written when `usage` is provided (errors without any completed step omit
 * them, matching the previous inline behavior). Returns the run id.
 */
export const recordRun = async (opts: RecordRunOptions): Promise<string> => {
	const id = opts.id ?? nanoid();
	await supabase.from("runs").insert({
		id,
		workspace_id: opts.workspaceId,
		version_id: opts.versionId,
		parent_run_id: opts.parentRunId ?? null,
		created_at: new Date(opts.startTime).toISOString(),
		is_error: opts.isError,
		is_test: opts.isTest ?? false,
		is_stream: opts.isStream,
		pre_processing_time: opts.preProcessingTime,
		first_token_time: opts.firstTokenTime,
		response_time: opts.responseTime,
		...(opts.usage
			? {
					tokens: opts.usage.totalTokens,
					cost: calculateModelCost(opts.modelId, opts.usage),
				}
			: {}),
	});
	await uploadRunData(id, opts.runData);
	return id;
};

export type RunAgentOptions = {
	workspaceId: string;
	agentId: string;
	environment: Environment;
	variables?: Record<string, string>;
	extraMessages?: ModelMessage[];
	overrides?: RunOverrides;
	abortSignal?: AbortSignal;
	startTime?: number;
	/**
	 * Agent IDs already on the execution stack (ancestors), NOT including
	 * `agentId`. Threaded through to bound agent-as-tool recursion.
	 */
	callStack?: string[];
	/** Id of the run that invoked this one; recorded as parent_run_id. */
	parentRunId?: string | null;
};

export type RunAgentResult = {
	text: string;
	messages: ModelMessage[];
	steps: StepResult<ToolSet>[];
	usage: LanguageModelUsage;
	runId: string;
};

/**
 * Run an agent to completion (non-streaming) and persist the run. This is the
 * reusable in-process entry point — used by internal callers such as the
 * agent-as-tool executor. The HTTP route keeps its own streaming/abort-aware
 * pipeline but shares `prepareRun` and `recordRun`.
 *
 * Propagate `abortSignal` from a parent run so cancelling the parent cancels
 * nested sub-agent calls. Errors are recorded then rethrown.
 */
export const runAgent = async (
	opts: RunAgentOptions,
): Promise<RunAgentResult> => {
	const startTime = opts.startTime ?? Date.now();
	const runId = nanoid();

	const prepared = await prepareRun({
		workspaceId: opts.workspaceId,
		agentId: opts.agentId,
		environment: opts.environment,
		startTime,
		runId,
		variables: opts.variables,
		overrides: opts.overrides,
		extraMessages: opts.extraMessages,
		callStack: opts.callStack,
	});

	const {
		model,
		modelId,
		versionId,
		data,
		finalMessages,
		allTools,
		closeAll,
		preProcessingTime,
		runData,
	} = prepared;

	// Collected for partial cost attribution if the run is aborted mid-flight.
	const collectedSteps: StepResult<ToolSet>[] = [];

	try {
		const result = await generateText({
			model,
			maxOutputTokens: data.maxOutputTokens,
			temperature: data.temperature,
			stopWhen: stepCountIs(data.maxStepCount || 10),
			messages: finalMessages,
			tools: allTools,
			output: data.outputFormat === "json" ? Output.json() : Output.text(),
			providerOptions: data.providerOptions,
			abortSignal: opts.abortSignal,
			onStepFinish: (step) => {
				collectedSteps.push(step as StepResult<ToolSet>);
			},
		});

		const { response, text, steps, totalUsage } = result;
		runData.steps = steps;
		runData.totalUsage = totalUsage;

		await recordRun({
			id: runId,
			parentRunId: opts.parentRunId,
			workspaceId: opts.workspaceId,
			versionId,
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

		return {
			text,
			messages: response.messages,
			steps,
			usage: totalUsage,
			runId,
		};
	} catch (error) {
		// A parent cancellation aborts the shared signal; record it as an abort
		// (with partial usage from completed steps) rather than a generic error.
		const aborted = opts.abortSignal?.aborted ?? false;
		const totalUsage = sumUsage(collectedSteps);
		runData.steps = collectedSteps;
		runData.totalUsage = totalUsage;
		runData.error = aborted
			? { name: "AbortError", message: "Run aborted by parent run" }
			: {
					name: error instanceof Error ? error.name : "UnknownError",
					message:
						error instanceof Error ? error.message : "Unknown error occured.",
					cause:
						error instanceof Error
							? (error as Error & { cause?: unknown }).cause
							: undefined,
				};

		await recordRun({
			id: runId,
			parentRunId: opts.parentRunId,
			workspaceId: opts.workspaceId,
			versionId,
			startTime,
			preProcessingTime,
			firstTokenTime: Date.now() - preProcessingTime - startTime,
			responseTime: 0,
			isError: true,
			isStream: false,
			modelId,
			usage: collectedSteps.length > 0 ? totalUsage : undefined,
			runData,
		});

		throw error;
	} finally {
		closeAll();
	}
};
