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
	totalMs: 20 * 60 * 1000, // 20 minutes overall
	chunkMs: 10 * 60 * 1000, // 10 minutes stall detection between stream chunks
} as const;

/**
 * Hard cap on a single MCP tool call.
 *
 * `@ai-sdk/mcp` settles a pending request only when a well-formed JSON-RPC
 * response arrives for its message id. A transport that dies mid-flight is
 * routed to `onerror` and dropped, and the pending request registers no abort
 * listener and no timeout of its own — so a connection that goes silent (a CDN
 * cutting an idle origin, a server that never replies) parks the tool `await`
 * forever, and with it the whole run. Neither RUN_TIMEOUT nor a client
 * disconnect can unstick it, because both work by aborting a signal nothing is
 * listening to.
 *
 * So we race every MCP tool call ourselves. Generous on purpose: legitimate
 * tools here run tens of seconds (image generation lands around 30s).
 */
export const MCP_TOOL_TIMEOUT_MS = Number(
	process.env.MCP_TOOL_TIMEOUT_MS ?? 2 * 60 * 1000,
);
