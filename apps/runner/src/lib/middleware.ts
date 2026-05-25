import type { LanguageModelMiddleware } from "ai";

// Mark the last prompt message as an Anthropic cache breakpoint so the
// provider reuses everything up to that point on subsequent calls within
// the 1-hour ephemeral cache window. Applied on the Vertex Anthropic
// path where `anthropic.cacheControl` maps straight to the raw API block.
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
