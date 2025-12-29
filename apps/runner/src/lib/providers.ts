import {
	type AmazonBedrockProviderSettings,
	createAmazonBedrock,
} from "@ai-sdk/amazon-bedrock";
import { type AzureOpenAIProviderSettings, createAzure } from "@ai-sdk/azure";
import {
	createGoogleGenerativeAI,
	type GoogleGenerativeAIProviderSettings,
} from "@ai-sdk/google";
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

	if (type === "openai") {
		return createOpenAI(data as OpenAIProviderSettings);
	}

	if (type === "azure") {
		return createAzure(data as AzureOpenAIProviderSettings);
	}

	if (type === "google") {
		return createGoogleGenerativeAI(data as GoogleGenerativeAIProviderSettings);
	}

	if (type === "bedrock") {
		return createAmazonBedrock(data as AmazonBedrockProviderSettings);
	}

	return null;
};
