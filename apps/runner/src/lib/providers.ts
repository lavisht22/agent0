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
import {
	createOpenResponses,
	type OpenResponsesProviderSettings,
} from "@ai-sdk/open-responses";
import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import {
	createOpenAICompatible,
	type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { createXai, type XaiProviderSettings } from "@ai-sdk/xai";

// The reasoning options for every openai-compatible / open-responses provider
// live under one fixed key in an agent's providerOptions. Each SDK reads options
// from the provider's `name`, so pinning the name here keeps that read key stable
// and matching the UI/storage, regardless of the provider's display name.
// camelCase avoids the SDKs' deprecation warning for hyphenated keys.
export const OPENAI_COMPATIBLE_PROVIDER_NAME = "openaiCompatible";
export const OPEN_RESPONSES_PROVIDER_NAME = "openResponses";

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

	if (type === "openai-compatible") {
		// Fronts OpenAI-compatible gateways (Bedrock's /openai/v1 endpoint,
		// Together, Fireworks, vLLM, …). Uses the Chat Completions API and forwards
		// reasoningEffort unmodified, so a prefixed model id doesn't defeat the
		// reasoning-model detection the way it does on the first-party provider.
		return createOpenAICompatible({
			...(data as OpenAICompatibleProviderSettings),
			name: OPENAI_COMPATIBLE_PROVIDER_NAME,
		});
	}

	if (type === "open-responses") {
		// Fronts gateways that speak the OpenAI Responses API (Bedrock's
		// /openai/v1/responses endpoint, LM Studio, self-hosted servers, …).
		// Unlike Chat Completions, the Responses API can carry reasoning effort
		// alongside function tools, and it forwards reasoning options for any
		// model id without the first-party provider's reasoning-model detection.
		return createOpenResponses({
			...(data as OpenResponsesProviderSettings),
			name: OPEN_RESPONSES_PROVIDER_NAME,
		});
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
