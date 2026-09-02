import { toast } from "@heroui/react";
import type { ProviderMetadata, TextStreamPart, Tool } from "ai";
import { events } from "fetch-event-stream";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";
import type z from "zod";
import type { assistantMessageSchema } from "@/components/assistant-message";
import type { MessageT } from "@/components/messages";

type AssistantMessage = z.infer<typeof assistantMessageSchema>;
type ReasoningPart = Extract<
	AssistantMessage["content"][number],
	{ type: "reasoning" }
>;

/**
 * Merges provider metadata one provider key deep. Successive chunks for the same
 * part can each carry only a subset of the keys — OpenAI's `reasoning-end` sends
 * just `itemId` while `reasoning-start` also sends `reasoningEncryptedContent` —
 * so replacing wholesale would drop fields already captured.
 */
const mergeProviderOptions = (
	existing: ProviderMetadata | undefined,
	incoming: ProviderMetadata | undefined,
): ProviderMetadata | undefined => {
	if (!incoming) return existing;
	if (!existing) return incoming;

	const merged: ProviderMetadata = { ...existing };
	for (const [provider, values] of Object.entries(incoming)) {
		merged[provider] = { ...merged[provider], ...values };
	}
	return merged;
};

export const useAgentRunner = ({
	variableValues,
	mcpHeaderValues,
	metadataValues,
	versionId,
	environment,
}: {
	variableValues: Record<string, string>;
	mcpHeaderValues: Record<string, Record<string, string>>;
	metadataValues: Record<string, string>;
	versionId?: string;
	environment: "staging" | "production";
}) => {
	const [isRunning, setIsRunning] = useState(false);
	const [errors, setErrors] = useState<unknown[]>([]);
	const [warnings, setWarnings] = useState<unknown[]>([]);
	const [generatedMessages, setGeneratedMessages] = useState<MessageT[]>([]);
	const abortRef = useRef<AbortController | null>(null);

	const handleRun = useCallback(
		async (data: unknown) => {
			// Abort any prior run that's still in flight before starting a new one.
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			try {
				setIsRunning(true);

				setGeneratedMessages([]);
				setErrors([]);
				setWarnings([]);

				// Auth rides the httpOnly session cookie (same-origin).
				const response = await fetch("/internal/test", {
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						data,
						variables: variableValues,
						version_id: versionId,
						environment,
						// Drop rows with an empty key; server validates the rest.
						metadata: Object.fromEntries(
							Object.entries(metadataValues).filter(([k]) => k.trim()),
						),
						mcp_options: Object.fromEntries(
							Object.entries(mcpHeaderValues)
								.filter(([, headers]) => Object.values(headers).some((v) => v))
								.map(([id, headers]) => [id, { headers }]),
						),
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const json = await response.json();
					setErrors((prev) => [...prev, json]);
				}

				const chunks = events(response);

				const generatedMessageState: MessageT[] = [];

				// Reasoning parts keyed by stream part id, so `reasoning-delta` and
				// `reasoning-end` land on the part their `reasoning-start` created.
				const reasoningParts = new Map<string, ReasoningPart>();

				for await (const chunk of chunks) {
					if (!chunk.data) continue;

					const parsed = JSON.parse(chunk.data) as TextStreamPart<{
						[key: string]: Tool<unknown, unknown>;
					}>;

					if (parsed.type === "error") {
						setErrors((prev) => [...prev, parsed.error]);
					}

					if (parsed.type === "start-step") {
						generatedMessageState.push({
							id: nanoid(),
							role: "assistant",
							content: [],
						});

						setWarnings((prev) => [...prev, ...parsed.warnings]);
					}

					const lastMessage = generatedMessageState[
						generatedMessageState.length - 1
					] as AssistantMessage;

					if (parsed.type === "text-start") {
						lastMessage.content.push({
							type: "text",
							text: "",
						});
					}

					if (parsed.type === "text-delta") {
						const lastPart =
							lastMessage.content[lastMessage.content.length - 1];

						if (lastPart.type === "text") {
							lastPart.text += parsed.text;
						}
					}

					if (parsed.type === "reasoning-start") {
						// The metadata carries the provider's reasoning item id (OpenAI's
						// `rs_…`). Dropping it means a later replay of this conversation
						// sends the sibling tool call as a stored-item reference whose
						// reasoning item is missing, which the Responses API rejects.
						const part: ReasoningPart = {
							type: "reasoning",
							text: "",
							providerOptions: parsed.providerMetadata,
						};

						lastMessage.content.push(part);
						reasoningParts.set(parsed.id, part);
					}

					if (parsed.type === "reasoning-delta") {
						const part = reasoningParts.get(parsed.id);

						if (part) {
							part.text += parsed.text;
							part.providerOptions = mergeProviderOptions(
								part.providerOptions,
								parsed.providerMetadata,
							);
						}
					}

					if (parsed.type === "reasoning-end") {
						const part = reasoningParts.get(parsed.id);

						if (part) {
							part.providerOptions = mergeProviderOptions(
								part.providerOptions,
								parsed.providerMetadata,
							);
						}
					}

					if (parsed.type === "tool-call") {
						lastMessage.content.push({
							type: "tool-call",
							toolCallId: parsed.toolCallId,
							toolName: parsed.toolName,
							providerOptions: parsed.providerMetadata,
							input: parsed.input,
						});
					}

					if (parsed.type === "tool-result") {
						generatedMessageState.push({
							id: nanoid(),
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: parsed.toolCallId,
									toolName: parsed.toolName,
									providerOptions: parsed.providerMetadata,
									output: {
										type: "json",
										value: parsed.output,
									},
								},
							],
						});
					}

					if (parsed.type === "tool-error") {
						generatedMessageState.push({
							id: nanoid(),
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: parsed.toolCallId,
									toolName: parsed.toolName,
									providerOptions: parsed.providerMetadata,
									output: {
										type: "error-json",
										value: parsed.error,
									} as unknown,
								},
							],
						});
					}

					setGeneratedMessages([...generatedMessageState]);
				}
			} catch (error) {
				// User-initiated cancel; partial generatedMessages stay on screen.
				if (error instanceof Error && error.name === "AbortError") return;
				toast.danger(
					error instanceof Error ? error.message : "Failed to run agent.",
				);
			} finally {
				setIsRunning(false);
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
			}
		},
		[variableValues, mcpHeaderValues, metadataValues, versionId, environment],
	);

	const handleStop = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	const resetRunner = useCallback(() => {
		setGeneratedMessages([]);
		setErrors([]);
		setWarnings([]);
	}, []);

	return {
		isRunning,
		errors,
		warnings,
		handleRun,
		handleStop,
		resetRunner,
		generatedMessages,
	};
};
