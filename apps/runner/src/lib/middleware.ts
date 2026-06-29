import type { LanguageModelMiddleware } from "ai";

// Mark the last prompt message as an Anthropic cache breakpoint so the provider
// reuses everything up to it within the 1-hour ephemeral cache window.
export const vertexAnthropicCacheMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		if (!params.prompt || params.prompt.length === 0) return params;

		const lastIndex = params.prompt.length - 1;
		const updatedPrompt = params.prompt.map((msg, index) =>
			index === lastIndex
				? {
						...msg,
						providerOptions: {
							...msg.providerOptions,
							anthropic: {
								...(msg.providerOptions?.anthropic ?? {}),
								cacheControl: { type: "ephemeral", ttl: "1h" },
							},
						},
					}
				: msg,
		);

		return { ...params, prompt: updatedPrompt };
	},
};

// Bedrock equivalent for the standard Amazon Bedrock (Converse API) provider.
// Converse uses "cache points" rather than Anthropic's `cacheControl`, exposed
// under the `bedrock` provider key. Marking the last prompt message inserts a
// cachePoint after its content so the prefix is reused across the tool-call
// loop. We omit `ttl` (defaults to 5m): the cache refreshes on every read, so
// it stays warm through a tightly-looping run, and 5m is supported on all
// caching-capable Claude models — unlike `1h`, which errors on models that
// don't support it and would break the whole run.
export const bedrockCacheMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		if (!params.prompt || params.prompt.length === 0) return params;

		const lastIndex = params.prompt.length - 1;
		const updatedPrompt = params.prompt.map((msg, index) =>
			index === lastIndex
				? {
						...msg,
						providerOptions: {
							...msg.providerOptions,
							bedrock: {
								...(msg.providerOptions?.bedrock ?? {}),
								cachePoint: { type: "default" },
							},
						},
					}
				: msg,
		);

		return { ...params, prompt: updatedPrompt };
	},
};
