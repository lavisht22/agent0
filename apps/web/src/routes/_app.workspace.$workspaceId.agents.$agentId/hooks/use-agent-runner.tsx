import { toast } from "@heroui/react";
import type { TextStreamPart, Tool } from "ai";
import { events } from "fetch-event-stream";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";
import type z from "zod";
import type { assistantMessageSchema } from "@/components/assistant-message";
import type { MessageT } from "@/components/messages";
import { getSessionToken } from "@/lib/auth-client";

export const useAgentRunner = ({
	variableValues,
	mcpHeaderValues,
	versionId,
	environment,
}: {
	variableValues: Record<string, string>;
	mcpHeaderValues: Record<string, Record<string, string>>;
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

				// Include the better-auth session bearer token.
				const token = getSessionToken();

				if (!token) {
					toast.danger("You must be logged in to run agents.");
					return;
				}

				const url = import.meta.env.DEV
					? "http://localhost:2223/internal/test"
					: "/internal/test";

				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						data,
						variables: variableValues,
						version_id: versionId,
						environment,
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

					type AssistantMessage = z.infer<typeof assistantMessageSchema>;

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
						lastMessage.content.push({
							type: "reasoning",
							text: "",
						});
					}

					if (parsed.type === "reasoning-delta") {
						const lastPart =
							lastMessage.content[lastMessage.content.length - 1];

						if (lastPart.type === "reasoning") {
							lastPart.text += parsed.text;
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
		[variableValues, mcpHeaderValues, versionId, environment],
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
