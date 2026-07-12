/**
 * AI SDK `timeout` settings shared by all generateText / streamText calls.
 *
 * - totalMs: hard cap on the entire multi-step call
 * - chunkMs: stream only — abort if no stream chunk for this long across the
 *   whole run (model tokens, tool-result events, etc.). Resets on every chunk;
 *   applies for the full multi-step lifetime, not per step.
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-core/settings#timeout
 */
export const RUN_TIMEOUT = {
	totalMs: 30 * 60 * 1000, // 30 minutes overall
	chunkMs: 10 * 60 * 1000, // 10 minutes stall detection between stream chunks
} as const;
