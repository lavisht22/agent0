import type { ModelMessage, PrepareStepFunction } from "ai";

type ProviderOptions = NonNullable<ModelMessage["providerOptions"]>;

/**
 * Marks the last message with a provider-specific prompt-cache breakpoint so
 * each multi-step model call can reuse the growing prefix (tools + system +
 * history) across the tool-call loop and across user turns.
 */
const markLastMessageForCache = (
	messages: ModelMessage[],
	cacheProviderOptions: ProviderOptions,
): ModelMessage[] => {
	if (messages.length === 0) return messages;

	const lastIndex = messages.length - 1;
	return messages.map((message, index) => {
		if (index !== lastIndex) return message;

		const providerOptions: ProviderOptions = {
			...message.providerOptions,
		};
		for (const [key, value] of Object.entries(cacheProviderOptions)) {
			providerOptions[key] = {
				...(message.providerOptions?.[key] ?? {}),
				...value,
			};
		}

		return {
			...message,
			providerOptions,
		};
	});
};

/**
 * Returns a `prepareStep` callback that applies the correct cache breakpoint
 * for the provider on every agent step. Returns `undefined` for providers
 * without explicit prompt-cache support so callers can pass it through as-is.
 *
 * - anthropic-vertex: Anthropic-style `cacheControl` (1h TTL)
 * - bedrock: Converse `cachePoint` (default 5m TTL — supported on all
 *   caching-capable Claude models; `1h` errors on models that don't support it)
 */
export const createPromptCachePrepareStep = (
	providerType: string,
): PrepareStepFunction | undefined => {
	if (providerType === "anthropic-vertex") {
		return ({ messages }) => ({
			messages: markLastMessageForCache(messages, {
				anthropic: { cacheControl: { type: "ephemeral"} },
			}),
		});
	}

	if (providerType === "bedrock") {
		return ({ messages }) => ({
			messages: markLastMessageForCache(messages, {
				bedrock: { cachePoint: { type: "default" } },
			}),
		});
	}

	return undefined;
};
