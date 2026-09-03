import {
	type AmazonBedrockProviderSettings,
	createAmazonBedrock,
} from "@ai-sdk/amazon-bedrock";
import { type AzureOpenAIProviderSettings, createAzure } from "@ai-sdk/azure";
import { createGoogle, type GoogleProviderSettings } from "@ai-sdk/google";
import {
	createVertexAnthropic,
	type GoogleVertexAnthropicProviderSettings,
} from "@ai-sdk/google-vertex/anthropic/edge";
import {
	createVertex,
	type GoogleVertexProviderSettings,
} from "@ai-sdk/google-vertex/edge";
import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import { createXai, type XaiProviderSettings } from "@ai-sdk/xai";

export const getAIProvider = (type: string, data: unknown) => {
	if (type === "xai") {
		return createXai(data as XaiProviderSettings);
	}

	if (type === "google-vertex") {
		return createVertex(data as GoogleVertexProviderSettings);
	}

	if (type === "anthropic-vertex") {
		return createVertexAnthropic(data as GoogleVertexAnthropicProviderSettings);
	}

	if (type === "openai") {
		return createOpenAI(data as OpenAIProviderSettings);
	}

	if (type === "azure") {
		return createAzure(data as AzureOpenAIProviderSettings);
	}

	if (type === "google") {
		return createGoogle(data as GoogleProviderSettings);
	}

	if (type === "bedrock") {
		return createAmazonBedrock(data as AmazonBedrockProviderSettings);
	}

	return null;
};
