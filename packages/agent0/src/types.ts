import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { embed, embedMany, ModelMessage } from "ai";

export interface Agent0Config {
	apiKey: string;
	baseUrl?: string;
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
	/** Google/Vertex thinking configuration */
	google?: GoogleGenerativeAIProviderOptions;
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
