import type { ModelMessage, PrepareStepFunction, ToolSet } from "ai";

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
 * Rebuilds the step's message list from the untouched originals rather than
 * from `messages`. As of AI SDK 7 a `messages` override returned by
 * `prepareStep` carries forward into every later step, so re-marking the new
 * last message on top of the previous step's output would leave the earlier
 * breakpoint in place and accumulate one per step — Anthropic caps a request at
 * four. `initialMessages + responseMessages` is the same list the SDK would
 * have built on its own, minus our markers.
 */
const stepMessages = (
	initialMessages: ModelMessage[],
	responseMessages: ModelMessage[],
): ModelMessage[] => [...initialMessages, ...responseMessages];

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
): PrepareStepFunction<ToolSet> | undefined => {
	if (providerType === "anthropic-vertex") {
		return ({ initialMessages, responseMessages }) => ({
			messages: markLastMessageForCache(
				stepMessages(initialMessages, responseMessages),
				{
					anthropic: { cacheControl: { type: "ephemeral" } },
				},
			),
		});
	}

	if (providerType === "bedrock") {
		return ({ initialMessages, responseMessages }) => ({
			messages: markLastMessageForCache(
				stepMessages(initialMessages, responseMessages),
				{
					bedrock: { cachePoint: { type: "default" } },
				},
			),
		});
	}

	return undefined;
};
