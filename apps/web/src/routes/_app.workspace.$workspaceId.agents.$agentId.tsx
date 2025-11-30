import {
	addToast,
	Button,
	ButtonGroup,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
	useDisclosure,
} from "@heroui/react";
import type { Json, Tables } from "@repo/database";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { TextStreamPart, Tool } from "ai";
import { events } from "fetch-event-stream";
import {
	LucideBraces,
	LucideChevronDown,
	LucideCornerUpLeft,
	LucideHistory,
	LucideListPlus,
	LucideLoader2,
	LucidePlay,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import useDb from "use-db";
import { z } from "zod";
import { HistoryDrawer } from "@/components/history-drawer";
import {
	type assistantMessageSchema,
	Messages,
	type MessageT,
	messageSchema,
} from "@/components/messages";
import { ProviderSelector } from "@/components/provider-selector";
import { VariablesDrawer } from "@/components/variables-drawer";
import { agentQuery, agentVersionsQuery, providersQuery } from "@/lib/queries";
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
	const [version, setVersion] = useState<Tables<"versions">>();
	const [name, setName] = useState("New Agent");
	const [variableValues, setVariableValues] = useDb<Record<string, string>>(
		`agent-variables-${agentId}`,
		{
			defaultValue: {} as Record<string, string>,
		},
	);

	const { isOpen: isVariablesOpen, onOpenChange: onVariablesOpenChange } =
		useDisclosure();
	const { isOpen: isHistoryOpen, onOpenChange: onHistoryOpenChange } =
		useDisclosure();

	// Fetch agent
	const { data: agent } = useQuery({
		...agentQuery(agentId),
		enabled: !isNewAgent,
	});

	useEffect(() => {
		if (!agent) return;
		setName(agent.name);
	}, [agent]);

	// Fetch available providers
	const { data: providers } = useQuery(providersQuery(workspaceId));

	// Fetch existing agent versions if editing
	const { data: versions } = useQuery({
		...agentVersionsQuery(agentId),
		enabled: !isNewAgent,
	});

	useEffect(() => {
		if (version) {
			return;
		}

		if (!versions || versions.length === 0) {
			return;
		}

		setVersion(versions[0]);
	}, [versions, version]);

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
				name,
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
			provider: { id: string; model: string };
			messages: MessageT[];
		}) => {
			const newVersionId = nanoid();

			// Create new version
			const { data: version, error: versionError } = await supabase
				.from("versions")
				.insert({
					id: newVersionId,
					agent_id: agentId,
					provider_id: values.provider.id,
					data: {
						model: values.provider.model,
						messages: values.messages,
					} as unknown as Json,
					is_deployed: false,
				})
				.select()
				.single();

			if (versionError) throw versionError;

			return version;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			setVersion(data);
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

	// Publish mutation
	const publishMutation = useMutation({
		mutationFn: async (version_id: string) => {
			await supabase
				.from("versions")
				.update({ is_deployed: false })
				.eq("agent_id", agentId)
				.throwOnError();

			const { data: version, error: versionError } = await supabase
				.from("versions")
				.update({ is_deployed: true })
				.eq("id", version_id)
				.select()
				.single();

			if (versionError) throw versionError;

			return version;
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			setVersion(data);
			addToast({
				description: "Version published successfully.",
				color: "success",
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to publish version.",
				color: "danger",
			});
		},
	});

	const updateNameMutation = useMutation({
		mutationFn: async (name: string) => {
			const { error } = await supabase
				.from("agents")
				.update({ name })
				.eq("id", agentId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error
						? error.message
						: "Failed to update agent name.",
				color: "danger",
			});
		},
	});

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
		onSubmit: async ({ value, meta }) => {
			const { publish } = meta as { publish: boolean };

			if (isNewAgent) {
				await createMutation.mutateAsync(value);
			} else {
				const version = await updateMutation.mutateAsync(value);

				if (publish) {
					await publishMutation.mutateAsync(version.id);
				}
			}
		},
	});

	useEffect(() => {
		if (!version) {
			return;
		}

		const data = version.data as {
			model?: string;
			messages?: MessageT[];
		};

		setTimeout(() => {
			form.reset(
				{
					provider: {
						id: version.provider_id,
						model: data.model || "",
					},
					messages: data.messages || [],
				},
				{ keepDefaultValues: true },
			);
		}, 200);
	}, [version, form]);

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

			const url = import.meta.env.DEV
				? "http://localhost:2223/api/v1/test"
				: "/api/v1/test";

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					provider_id: form.getFieldValue("provider").id,
					data: {
						model: form.getFieldValue("provider").model,
						messages: form.getFieldValue("messages"),
						variables: variableValues,
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
	}, [form, variableValues]);

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
				<input
					className="w-full max-w-96 font-medium outline-none transition"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onBlur={() => updateNameMutation.mutate(name)}
				/>

				<div className="flex items-center gap-2">
					<form.Subscribe
						selector={(state) => ({
							isDirty: state.isDirty,
						})}
					>
						{(state) => {
							if (state.isDirty || isNewAgent) {
								return <p className="text-sm text-default-500">Unsaved</p>;
							}

							return (
								<p className="text-sm text-default-500">
									#{version?.id.slice(0, 7)}
								</p>
							);
						}}
					</form.Subscribe>
					<HistoryDrawer
						isOpen={isHistoryOpen}
						onOpenChange={onHistoryOpenChange}
						workspaceId={workspaceId}
						versions={versions || []}
						onSelectionChange={(v: Tables<"versions">) => {
							setVersion(v);
						}}
					/>
					{versions?.length && (
						<Button
							isIconOnly
							variant="flat"
							onPress={() => onHistoryOpenChange()}
						>
							<LucideHistory className="size-4" />
						</Button>
					)}

					<form.Subscribe selector={(state) => state.values.messages}>
						{(messages) => (
							<VariablesDrawer
								isOpen={isVariablesOpen}
								onOpenChange={onVariablesOpenChange}
								messages={messages}
								values={variableValues}
								onValuesChange={setVariableValues}
								onRun={handleRun}
							/>
						)}
					</form.Subscribe>
					<Button
						isIconOnly
						variant="flat"
						onPress={() => onVariablesOpenChange()}
					>
						<LucideBraces className="size-4" />
					</Button>

					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
							isDirty: state.isDirty,
						})}
					>
						{(state) => {
							// New agent - show Create button
							if (isNewAgent) {
								return (
									<Button
										color="primary"
										isLoading={state.isSubmitting}
										isDisabled={!state.canSubmit}
										onPress={() => form.handleSubmit({ publish: false })}
									>
										Create
									</Button>
								);
							}

							return (
								<ButtonGroup>
									<Button
										color="primary"
										isLoading={
											state.isSubmitting ||
											updateMutation.isPending ||
											publishMutation.isPending
										}
										isDisabled={
											!state.canSubmit ||
											(!state.isDirty && version?.is_deployed)
										}
										onPress={async () => {
											if (state.isDirty) {
												form.handleSubmit({ publish: true });
											} else {
												if (!version) return;
												await publishMutation.mutateAsync(version.id);
											}
										}}
									>
										Publish
									</Button>
									<Dropdown placement="bottom-end" isDisabled={!state.isDirty}>
										<DropdownTrigger>
											<Button
												isIconOnly
												color="primary"
												isDisabled={!state.isDirty}
											>
												<LucideChevronDown className="size-4" />
											</Button>
										</DropdownTrigger>
										<DropdownMenu>
											<DropdownItem
												key="update-only"
												onPress={() => form.handleSubmit({ publish: false })}
											>
												Update Only
											</DropdownItem>
										</DropdownMenu>
									</Dropdown>
								</ButtonGroup>
							);
						}}
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
									onVariablePress={onVariablesOpenChange}
								/>
							)}
						</form.Field>
					</div>
					<div className="flex justify-between items-center p-4 border-t border-default-200">
						<Dropdown placement="top-start">
							<DropdownTrigger>
								<Button
									variant="flat"
									startContent={<LucideListPlus className="size-4" />}
								>
									Add
								</Button>
							</DropdownTrigger>
							<DropdownMenu>
								<DropdownItem
									key="user"
									title="User Message"
									onPress={() => {
										const currentMessages = form.getFieldValue("messages");
										form.setFieldValue("messages", [
											...currentMessages,
											{ role: "user", content: [{ type: "text", text: "" }] },
										]);
									}}
								/>
								<DropdownItem
									key="assistant"
									title="Assistant Message"
									onPress={() => {
										const currentMessages = form.getFieldValue("messages");
										form.setFieldValue("messages", [
											...currentMessages,
											{
												role: "assistant",
												content: [{ type: "text", text: "" }],
											},
										]);
									}}
								/>
							</DropdownMenu>
						</Dropdown>
						<Button
							color="primary"
							type="button"
							onPress={handleRun}
							isDisabled={isRunning}
							startContent={
								isRunning ? (
									<LucideLoader2 className="animate-spin size-4" />
								) : (
									<LucidePlay className="size-4" />
								)
							}
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
						onVariablePress={onVariablesOpenChange}
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
