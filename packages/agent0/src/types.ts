import type { BedrockProviderOptions } from "@ai-sdk/amazon-bedrock";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { embed, embedMany, ModelMessage } from "ai";

export interface Agent0Config {
	apiKey: string;
	workspaceId: string;
	baseUrl?: string;
	/** Default environment to use for all runs. Can be overridden per-run. Defaults to 'production'. */
	environment?: Environment;
}

/**
 * Provider-specific options for reasoning/thinking configuration.
 * Each provider has its own format for controlling reasoning behavior.
 */
export interface ProviderOptions {
	/** OpenAI reasoning effort options */
	openai?: OpenAIResponsesProviderOptions;
	/** xAI reasoning effort options */
	xai?: XaiProviderOptions;
	/** Google Generative AI thinking configuration */
	google?: GoogleGenerativeAIProviderOptions;
	/** Google Vertex AI thinking configuration */
	vertex?: GoogleGenerativeAIProviderOptions;
	/** Amazon Bedrock thinking configuration */
	bedrock?: BedrockProviderOptions;
}

/**
 * Model configuration overrides for runtime customization.
 * Allows downstream applications to implement load balancing, fallbacks, and dynamic model switching.
 */
export interface ModelOverrides {
	/** Override the model provider and name */
	model?: {
		provider_id?: string;
		name?: string;
	};
	/** Override max output tokens */
	maxOutputTokens?: number;
	/** Override temperature */
	temperature?: number;
	/** Override max step count */
	maxStepCount?: number;
	/** Provider-specific options for reasoning/thinking configuration */
	providerOptions?: ProviderOptions;
}

/**
 * A custom tool defined at runtime.
 * Custom tools have title, description, and inputSchema but no execute function.
 * The LLM will generate tool calls for these, but execution must be handled externally.
 */
export interface CustomTool {
	/** Unique title for the tool (lowercase with underscores recommended) */
	title: string;
	/** Description of what the tool does - helps the AI understand when to use it */
	description: string;
	/** JSON Schema defining the parameters this tool accepts */
	inputSchema?: Record<string, unknown>;
}

/**
 * Environment to run the agent in.
 * - 'staging': Run the staging-deployed version of the agent
 * - 'production': Run the production-deployed version of the agent (default)
 */
export type Environment = "staging" | "production";

export interface RunOptions {
	agentId: string;
	/** Environment to run ('staging' or 'production'). Defaults to 'production'. */
	environment?: Environment;
	variables?: Record<string, string>;
	/** Runtime model overrides for load balancing, fallbacks, etc. */
	overrides?: ModelOverrides;
	/** Extra messages to append to the agent's prompt (used as-is, no variable substitution) */
	extraMessages?: ModelMessage[];
	/** Additional custom tools to add at runtime. These are merged with any tools defined in the agent. */
	extraTools?: CustomTool[];
	/** Per-MCP server runtime options, keyed by MCP server ID. */
	mcpOptions?: Record<string, {
		/** Custom headers to send to this MCP server */
		headers?: Record<string, string>;
	}>;
	/**
	 * Arbitrary string key-value labels stored on the run for later filtering
	 * (e.g. `{ user_id: "u_123" }`). Max 10 keys; each key and value must be under
	 * 128 characters. Inherited by any agent-as-tool sub-runs this run spawns.
	 */
	metadata?: Record<string, string>;
	/**
	 * Abort signal to cancel the request. When aborted, the underlying fetch is
	 * cancelled, the server detects the disconnect, and the in-flight agent run
	 * is killed. Pass `ctx.signal` from a trigger.dev task or any other host
	 * abort signal here to propagate cancellation end-to-end.
	 */
	signal?: AbortSignal;
}

export interface GenerateResponse {
	messages: ModelMessage[];
	text: string;
}

/**
 * Model specification for Agent0 embedding operations.
 * Instead of passing an EmbeddingModel instance, pass the provider_id and model name.
 */
export interface EmbedModel {
	/** The provider ID (from your Agent0 providers configuration) */
	provider_id: string;
	/** The embedding model name (e.g., 'text-embedding-3-small', 'text-embedding-ada-002') */
	name: string;
}

/**
 * Options for the embed function.
 * Extends Vercel AI SDK's embed parameters, only modifying the `model` property
 * to use Agent0's provider_id + name format instead of an EmbeddingModel instance.
 */
export type EmbedOptions = Omit<Parameters<typeof embed>[0], "model"> & {
	model: EmbedModel;
	/** Abort signal to cancel the HTTP request. See {@link RunOptions.signal}. */
	signal?: AbortSignal;
};

/**
 * Options for the embedMany function.
 * Extends Vercel AI SDK's embedMany parameters, only modifying the `model` property
 * to use Agent0's provider_id + name format instead of an EmbeddingModel instance.
 */
export type EmbedManyOptions = Omit<
	Parameters<typeof embedMany>[0],
	"model"
> & {
	model: EmbedModel;
	/** Abort signal to cancel the HTTP request. See {@link RunOptions.signal}. */
	signal?: AbortSignal;
};

/**
 * Response from the embed function.
 */
export interface EmbedResponse {
	/** The embedding vector */
	embedding: number[];
}

/**
 * Response from the embedMany function.
 */
export interface EmbedManyResponse {
	/** The embedding vectors (one per input value) */
	embeddings: number[][];
}

/** A tag attached to an agent. */
export interface Tag {
	id: string;
	name: string;
	color: string;
}

/** A provider/model pair as stored on an agent version. */
export interface ModelSummary {
	provider_id: string;
	name: string;
}

/**
 * An agent, as returned by `getAgent` / `listAgents`.
 * `staging_model` and `production_model` are read off the deployed versions and
 * are `null` when nothing is deployed to that environment.
 */
export interface Agent {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
	staging_model: ModelSummary | null;
	production_model: ModelSummary | null;
	tags: Tag[];
	created_at: string;
	updated_at: string;
}

/** A tool backed by an MCP server configured in the workspace. */
export interface McpToolDefinition {
	type: "mcp";
	mcp_id: string;
	name: string;
}

/** A client-executed tool: the model emits calls, your app executes them. */
export interface CustomToolDefinition {
	type: "custom";
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
}

/** Another agent in the same workspace exposed as a tool. */
export interface AgentToolDefinition {
	type: "agent";
	agent_id: string;
	name: string;
	description: string;
}

export type ToolDefinition =
	| McpToolDefinition
	| CustomToolDefinition
	| AgentToolDefinition;

/** A skill embedded in an agent version (versioned alongside the prompt). */
export interface Skill {
	id: string;
	name: string;
	description: string;
	body: string;
}

/**
 * The stored contents of an agent version — the prompt and everything versioned
 * with it.
 *
 * This is the prompt *as saved*: `{{variable}}` placeholders are left intact and
 * no run-time assembly (skill catalog injection, MCP tool discovery) has been
 * applied. It is what a run would start from, not the final payload sent to the
 * model.
 */
export interface VersionData {
	model: ModelSummary;
	messages: ModelMessage[];
	maxOutputTokens?: number;
	outputFormat?: "text" | "json";
	temperature?: number;
	maxStepCount?: number;
	tools?: ToolDefinition[];
	skills?: Skill[];
	providerOptions?: ProviderOptions;
}

/** An agent version without its contents, as returned by `listVersions`. */
export interface AgentVersionSummary {
	id: string;
	agent_id: string;
	/** True if this version was deployed to an environment when it was created. */
	is_deployed: boolean;
	/** ID of the user who pushed the version. */
	user_id: string;
	created_at: string;
}

/** An agent version including its contents, as returned by `getVersion`. */
export interface AgentVersion extends AgentVersionSummary {
	data: VersionData;
}

export interface ListAgentsOptions {
	/** Case-insensitive substring match on the agent name. */
	search?: string;
	/** Only return agents carrying ALL of these tag IDs. */
	tagIds?: string[];
	/** 1-based page number. Defaults to 1. */
	page?: number;
	/** Items per page, capped at 100 by the server. Defaults to 20. */
	limit?: number;
	/** Abort signal to cancel the HTTP request. */
	signal?: AbortSignal;
}

export interface ListVersionsOptions {
	/** 1-based page number. Defaults to 1. */
	page?: number;
	/** Items per page, capped at 100 by the server. Defaults to 20. */
	limit?: number;
	/** Abort signal to cancel the HTTP request. */
	signal?: AbortSignal;
}

export interface RequestOptions {
	/** Abort signal to cancel the HTTP request. */
	signal?: AbortSignal;
}

/** A page of results, echoing back the pagination that produced it. */
export interface PaginatedResponse<T> {
	data: T[];
	page: number;
	limit: number;
}
