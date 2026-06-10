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
