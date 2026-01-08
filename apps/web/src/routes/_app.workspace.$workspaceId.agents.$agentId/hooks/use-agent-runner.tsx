import { addToast } from "@heroui/react";
import type { Tables } from "@repo/database";
import type { ReactFormExtendedApi } from "@tanstack/react-form";
import type { TextStreamPart, Tool } from "ai";
import { events } from "fetch-event-stream";
import { useCallback, useState } from "react";
import type z from "zod";
import type { assistantMessageSchema } from "@/components/assistant-message";
import type { MessageT } from "@/components/messages";
import { supabase } from "@/lib/supabase";

export const useAgentRunner = ({
	variableValues,
	version,
}: {
	variableValues: Record<string, string>;
	version?: Tables<"versions">;
}) => {
	const [isRunning, setIsRunning] = useState(false);
	const [errors, setErrors] = useState<unknown[]>([]);
	const [warnings, setWarnings] = useState<unknown[]>([]);
	const [generatedMessages, setGeneratedMessages] = useState<MessageT[]>([]);

	const handleRun = useCallback(
		async (data: unknown) => {
			try {
				setIsRunning(true);

				setGeneratedMessages([]);
				setErrors([]);
				setWarnings([]);

				// Get the user's session to include the JWT token
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					addToast({
						description: "You must be logged in to run agents.",
						color: "danger",
					});
					return;
				}

				const url = import.meta.env.DEV
					? "http://localhost:2223/api/v1/test"
					: "/api/v1/test";

				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({
						data,
						variables: variableValues,
						version_id: version?.id,
					}),
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
				addToast({
					description:
						error instanceof Error ? error.message : "Failed to run agent.",
					color: "danger",
				});
			} finally {
				setIsRunning(false);
			}
		},
		[variableValues, version],
	);

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
		resetRunner,
		generatedMessages,
	};
};
