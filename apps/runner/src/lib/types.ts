import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { ModelMessage, StepResult, ToolSet } from "ai";

// /**
//  * Provider-specific options for reasoning/thinking configuration.
//  * Each provider has its own format for controlling reasoning behavior.
//  */
export type ProviderOptions = {
	openai?: OpenAIResponsesProviderOptions;
	xai?: XaiProviderOptions;
	google?: GoogleGenerativeAIProviderOptions;
};

export type VersionData = {
	model: { provider_id: string; name: string };
	messages: ModelMessage[];
	maxOutputTokens?: number;
	outputFormat?: "text" | "json";
	temperature?: number;
	maxStepCount?: number;
	tools?: { mcp_id: string; name: string }[];
	providerOptions?: ProviderOptions;
};

export type RunData = {
	request?: VersionData & {
		stream: boolean;
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
	};

	steps?: StepResult<ToolSet>[];
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
	metrics: {
		preProcessingTime: number;
		firstTokenTime: number;
		responseTime: number;
	};
};

export type MCPConfig = {
	transport: {
		type: "sse" | "http";
		url: string;
		headers?: Record<string, string>;
	};
};
