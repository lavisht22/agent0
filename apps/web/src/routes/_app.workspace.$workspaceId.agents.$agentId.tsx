import { addToast, Button } from "@heroui/react";
import type { Json } from "@repo/database";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { TextStreamPart, Tool } from "ai";
import { events, stream } from "fetch-event-stream";
import { LucideCornerUpLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
	type assistantMessageSchema,
	Messages,
	type MessageT,
	messageSchema,
} from "@/components/messages";
import { ProviderSelector } from "@/components/provider-selector";
import { agentVersionsQuery, providersQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/agents/$agentId",
)({
	component: RouteComponent,
});

// Zod schema for form validation
const agentFormSchema = z.object({
	provider: z.object({
		id: z.string(),
		model: z.string(),
	}),
	messages: z.array(messageSchema).min(1, "At least one message is required"),
});

function RouteComponent() {
	const { workspaceId, agentId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewAgent = agentId === "new";
	const [generatedMessages, setGeneratedMessages] = useState<MessageT[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	// Fetch available providers
	const { data: providers, isLoading: isLoadingProviders } = useQuery(
		providersQuery(workspaceId),
	);

	// Fetch existing agent versions if editing
	const { data: versions, isLoading: isLoadingVersions } = useQuery({
		...agentVersionsQuery(agentId),
		enabled: !isNewAgent,
	});

	// Create mutation (creates both agent and first version)
	const createMutation = useMutation({
		mutationFn: async (values: {
			provider: { id: string; model: string };
			messages: MessageT[];
		}) => {
			const newAgentId = nanoid();
			const newVersionId = nanoid();

			// Create agent
			const { error: agentError } = await supabase.from("agents").insert({
				id: newAgentId,
				name: "",
				workspace_id: workspaceId,
			});

			if (agentError) throw agentError;

			// Create first version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: newAgentId,
				provider_id: values.provider.id,
				data: {
					model: values.provider.model,
					messages: values.messages,
				} as unknown as Json,
				is_deployed: false,
			});

			if (versionError) throw versionError;

			return newAgentId;
		},
		onSuccess: (newAgentId) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			addToast({
				description: "Agent created successfully.",
				color: "success",
			});
			navigate({
				to: "/workspace/$workspaceId/agents/$agentId",
				params: { workspaceId, agentId: newAgentId },
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to create agent.",
				color: "danger",
			});
		},
	});

	// Update mutation (creates new version)
	const updateMutation = useMutation({
		mutationFn: async (values: {
			provider: {
				id: string;
				model: string;
			};
			messages: MessageT[];
		}) => {
			const newVersionId = nanoid();

			// Create new version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: agentId,
				provider_id: values.provider.id,
				data: {
					model: values.provider.model,
					messages: values.messages,
				} as unknown as Json,
				is_deployed: false,
			});

			if (versionError) throw versionError;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			addToast({
				description: "New version created successfully.",
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to create new version.",
				color: "danger",
			});
		},
	});

	const latestVersion = useMemo(() => versions?.[0], [versions]);

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			provider: {
				id: "",
				model: "",
			},
			messages: [
				{
					role: "system",
					content: "",
				},
			] as MessageT[],
		},
		validators: {
			onChange: agentFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (isNewAgent) {
				await createMutation.mutateAsync(value);
			} else {
				await updateMutation.mutateAsync(value);
			}
		},
	});

	useEffect(() => {
		if (!latestVersion) {
			return;
		}

		const data = latestVersion.data as {
			model?: string;
			messages?: MessageT[];
		};

		form.setFieldValue("provider.id", latestVersion.provider_id);
		form.setFieldValue("provider.model", data.model || "");
		form.setFieldValue("messages", data.messages || []);
	}, [latestVersion, form.setFieldValue]);

	const handleAddToConversation = useCallback(() => {
		const newMessages = form.getFieldValue("messages").slice();

		generatedMessages.forEach((msg) => {
			newMessages.push(msg);
		});

		form.setFieldValue("messages", newMessages);
		setGeneratedMessages([]);
	}, [form.getFieldValue, form.setFieldValue, generatedMessages]);

	const handleRun = useCallback(async () => {
		try {
			setIsRunning(true);

			setGeneratedMessages([]);

			const response = await fetch(`http://localhost:2223/api/test`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					provider_id: form.getFieldValue("provider").id,
					data: {
						model: form.getFieldValue("provider").model,
						messages: form.getFieldValue("messages"),
					},
				}),
			});

			if (!response.ok) {
				throw new Error(
					(await response.json()).message || "Failed to run agent.",
				);
			}

			const chunks = events(response);

			const generatedMessageState: MessageT[] = [];

			for await (const chunk of chunks) {
				if (!chunk.data) continue;

				const parsed = JSON.parse(chunk.data) as TextStreamPart<{
					[key: string]: Tool<unknown, unknown>;
				}>;

				if (parsed.type === "start-step") {
					generatedMessageState.push({
						role: "assistant",
						content: [],
					});
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
					const lastPart = lastMessage.content[lastMessage.content.length - 1];

					if (lastPart.type === "text") {
						lastPart.text += parsed.text;
					}
				}

				if (parsed.type === "tool-call") {
					// TODO: handle this
				}

				if (parsed.type === "tool-result") {
					// TODO: handle this
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
	}, [form.getFieldValue]);

	const isLoading =
		createMutation.isPending ||
		updateMutation.isPending ||
		isLoadingProviders ||
		isLoadingVersions;

	return (
		<form
			className="flex flex-col h-screen"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<div className="mt-px w-full flex items-center justify-between p-4 h-16 border-b border-default-200 shrink-0">
				<p>Name</p>

				<div className="flex items-center gap-2">
					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
						})}
					>
						{(state) => (
							<Button
								type="submit"
								color="primary"
								isLoading={isLoading || state.isSubmitting}
								isDisabled={!state.canSubmit || isLoading}
							>
								{isNewAgent ? "Create Agent" : "Save New Version"}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</div>
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 flex flex-col border-r border-default-200 min-h-0">
					<div className="flex-1 overflow-y-auto p-4 space-y-4">
						<form.Field name="provider">
							{(field) => (
								<ProviderSelector
									value={field.state.value}
									onChange={field.handleChange}
									providers={providers || []}
									isInvalid={field.state.meta.errors.length > 0}
								/>
							)}
						</form.Field>

						<form.Field name="messages" mode="array">
							{(field) => (
								<Messages
									value={field.state.value}
									onValueChange={field.handleChange}
								/>
							)}
						</form.Field>
					</div>
					<div className="flex justify-end p-4 border-t border-default-200">
						<Button
							color="primary"
							type="button"
							onPress={handleRun}
							isLoading={isRunning}
						>
							Run
						</Button>
					</div>
				</div>

				<div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
					{!isRunning && generatedMessages.length === 0 && (
						<p className="text-sm text-default-500 my-auto text-center">
							Run your agent to see the generated response here.
						</p>
					)}
					<Messages
						isReadOnly
						value={generatedMessages}
						onValueChange={setGeneratedMessages}
					/>
					<div>
						{!isRunning && generatedMessages.length > 0 && (
							<Button
								variant="flat"
								startContent={<LucideCornerUpLeft className="size-4" />}
								onPress={handleAddToConversation}
							>
								Add to conversation
							</Button>
						)}
					</div>
				</div>
			</div>
		</form>
	);
}
