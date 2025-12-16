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

export interface RunOptions {
	agentId: string;
	variables?: Record<string, string>;
	/** Runtime model overrides for load balancing, fallbacks, etc. */
	overrides?: ModelOverrides;
	/** Extra messages to append to the agent's prompt (used as-is, no variable substitution) */
	extraMessages?: ModelMessage[];
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
