import {
	Button,
	Input,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Select,
	SelectItem,
	Slider,
	useDisclosure,
} from "@heroui/react";
import type { Tables } from "@repo/database";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";

import {
	LucideBraces,
	LucideCode,
	LucideCornerUpLeft,
	LucideLoader2,
	LucidePlay,
	LucideSettings2,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import useDb from "use-db";

import { Messages, type MessageT } from "@/components/messages";
import { TagsSelect } from "@/components/tags-select";
import { copyToClipboard } from "@/lib/clipboard";
import {
	agentQuery,
	agentTagsQuery,
	agentVersionsQuery,
	mcpsQuery,
	providersQuery,
} from "@/lib/queries";
import { Action } from "./components/action";
import { AddMessage } from "./components/add-message";
import { Alerts } from "./components/alerts";
import { ModelSelector } from "./components/model-selector";
import { ProviderOptions } from "./components/provider-options";
import ToolsSection from "./components/tools-section";
import { VariablesDrawer } from "./components/variables-drawer";
import { VersionHistory } from "./components/version-history";
import { useAgentMutations } from "./hooks/use-agent-mutations";
import { useAgentRunner } from "./hooks/use-agent-runner";
import { type AgentFormValues, agentFormSchema } from "./types";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/agents/$agentId/",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { workspaceId, agentId } = Route.useParams();
	const location = useLocation();
	const isNewAgent = agentId === "new";

	const [version, setVersion] = useState<Tables<"versions">>();
	const [name, setName] = useState("New Agent");
	const [variableValues, setVariableValues] = useDb<Record<string, string>>(
		`agent-variables-${agentId}`,
		{
			defaultValue: {} as Record<string, string>,
		},
	);
	const [mcpHeaderValues, setMcpHeaderValues] = useDb<
		Record<string, Record<string, string>>
	>(`agent-mcp-headers-${agentId}`, {
		defaultValue: {} as Record<string, Record<string, string>>,
	});

	const { isOpen: isVariablesOpen, onOpenChange: onVariablesOpenChange } =
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

	// Fetch MCPs (for custom headers in the variables drawer)
	const { data: mcps } = useQuery(mcpsQuery(workspaceId));

	// Fetch existing agent versions if editing
	const { data: versions } = useQuery({
		...agentVersionsQuery(agentId),
		enabled: !isNewAgent,
	});

	// Fetch agent tags
	const { data: agentTags } = useQuery(agentTagsQuery(agentId));

	// Derive selected tag IDs from agent tags
	const selectedTagIds = agentTags?.map((at) => at.tag_id) || [];

	useEffect(() => {
		if (version) {
			return;
		}

		if (!versions || versions.length === 0) {
			return;
		}

		setVersion(versions[0]);
	}, [versions, version]);

	const {
		createMutation,
		updateMutation,
		updateNameMutation,
		deployMutation,
		syncTagsMutation,
	} = useAgentMutations({ name, agentId, workspaceId, setVersion });

	const {
		isRunning,
		errors,
		warnings,
		handleRun,
		resetRunner,
		generatedMessages,
	} = useAgentRunner({ variableValues, mcpHeaderValues, version });

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			model: { provider_id: "", name: "" },
			maxOutputTokens: 2048,
			outputFormat: "text" as "text" | "json",
			temperature: 0.7,
			maxStepCount: 10,
			messages: [
				{
					id: "system-init",
					role: "system",
					content: "",
				},
			] as MessageT[],
			tools: [] as AgentFormValues["tools"],
			providerOptions: {} as AgentFormValues["providerOptions"],
		},
		validators: {
			onChange: agentFormSchema,
		},
		onSubmit: async ({ value, meta }) => {
			const { deployTo } = meta as {
				deployTo?: "staging" | "production";
			};

			if (isNewAgent) {
				await createMutation.mutateAsync(value);
			} else {
				const version = await updateMutation.mutateAsync(value);

				if (deployTo) {
					await deployMutation.mutateAsync({
						version_id: version.id,
						environment: deployTo,
					});
				}
			}
		},
	});

	useEffect(() => {
		if (!version) {
			return;
		}

		const data = version.data as AgentFormValues;

		// Ensure all messages have IDs (for backward compatibility with old data)
		const messagesWithIds = (data.messages || []).map((msg) => ({
			...msg,
			id: msg.id || nanoid(),
		})) as MessageT[];

		form.reset(
			{
				model: data.model || { provider_id: "", name: "" },
				maxOutputTokens: data.maxOutputTokens || 2048,
				outputFormat: data.outputFormat || "text",
				temperature: data.temperature ?? 0.7,
				maxStepCount: data.maxStepCount || 10,
				messages: messagesWithIds,
				tools: data.tools || [],
				providerOptions: data.providerOptions || {},
			},
			{ keepDefaultValues: true },
		);
	}, [version, form]);

	// Check for replay data from router state when creating a new agent
	useEffect(() => {
		if (!isNewAgent) return;

		const state = location.state as {
			replayData?: AgentFormValues;
		} | null;

		if (!state?.replayData) return;

		// Ensure all messages have IDs (for backward compatibility)
		const replayDataWithIds = {
			...state.replayData,
			messages: state.replayData.messages.map((msg) => ({
				...msg,
				id: msg.id || nanoid(),
			})),
		};

		setTimeout(() => {
			form.reset(replayDataWithIds, { keepDefaultValues: true });
		}, 200);
	}, [isNewAgent, location.state, form]);

	const handleAddToConversation = useCallback(() => {
		const newMessages = form.getFieldValue("messages").slice();

		generatedMessages.forEach((msg) => {
			newMessages.push(msg);
		});

		form.setFieldValue("messages", newMessages);
		resetRunner();
	}, [form.getFieldValue, form.setFieldValue, generatedMessages, resetRunner]);

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
				<div className="flex gap-2 items-center">
					<input
						className="field-sizing-content text-xl tracking-tight font-medium outline-none transition"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onBlur={() => updateNameMutation.mutate(name)}
					/>
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
				</div>

				<div className="flex items-center gap-2">
					{!isNewAgent && (
						<div className="w-64">
							<TagsSelect
								workspaceId={workspaceId}
								selectedTags={selectedTagIds}
								onTagsChange={(tagIds) => syncTagsMutation.mutate(tagIds)}
								allowCreate
							/>
						</div>
					)}

					{agent && (
						<Button
							size="sm"
							variant="flat"
							isIconOnly
							onPress={() => copyToClipboard(agent.id, "Copied agent ID!")}
						>
							<LucideCode className="size-3.5" />
						</Button>
					)}

					{versions?.length && (
						<VersionHistory
							workspaceId={workspaceId}
							versions={versions || []}
							stagingVersionId={agent?.staging_version_id}
							productionVersionId={agent?.production_version_id}
							onSelectionChange={(v: Tables<"versions">) => {
								setVersion(v);
							}}
						/>
					)}

					<form.Subscribe
						selector={(state) => ({
							messages: state.values.messages,
							tools: state.values.tools,
						})}
					>
						{({ messages, tools }) => (
							<VariablesDrawer
								isOpen={isVariablesOpen}
								onOpenChange={onVariablesOpenChange}
								messages={messages}
								values={variableValues}
								onValuesChange={setVariableValues}
								onRun={() => handleRun(form.state.values)}
								mcps={mcps}
								tools={tools}
								mcpHeaderValues={mcpHeaderValues}
								onMcpHeaderValuesChange={setMcpHeaderValues}
							/>
						)}
					</form.Subscribe>

					<form.Subscribe
						selector={(state) => ({
							canSubmit: state.canSubmit,
							isSubmitting: state.isSubmitting,
							isDirty: state.isDirty,
						})}
					>
						{(state) => {
							return (
								<Action
									isNewAgent={isNewAgent}
									canSubmit={state.canSubmit}
									isSubmitting={state.isSubmitting}
									isMutationPending={
										updateMutation.isPending || deployMutation.isPending
									}
									isDirty={state.isDirty}
									handleSubmit={form.handleSubmit}
									agent={agent}
									version={version}
									deploy={async (
										version_id: string,
										environment: "staging" | "production",
									) => {
										await deployMutation.mutateAsync({
											version_id,
											environment,
										});
									}}
								/>
							);
						}}
					</form.Subscribe>
				</div>
			</div>
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-1 flex flex-col border-r border-default-200 min-h-0">
					<div className="flex gap-2 justify-between items-center p-4 border-b border-default-200">
						<div className="flex gap-2">
							<form.Field name="model">
								{(field) => (
									<ModelSelector
										value={field.state.value}
										onValueChange={field.handleChange}
										providers={providers || []}
										isInvalid={field.state.meta.errors.length > 0}
									/>
								)}
							</form.Field>

							<Popover placement="bottom">
								<PopoverTrigger>
									<Button
										size="sm"
										startContent={<LucideSettings2 className="size-4" />}
										variant="flat"
									>
										Parameters
									</Button>
								</PopoverTrigger>
								<PopoverContent className="p-4 flex flex-col items-start gap-4 w-96">
									<form.Field name="maxOutputTokens">
										{(field) => (
											<Input
												variant="bordered"
												type="number"
												label="Max Output Tokens"
												value={field.state.value.toString()}
												onValueChange={(value) =>
													field.handleChange(parseInt(value, 10))
												}
											/>
										)}
									</form.Field>
									<form.Field name="outputFormat">
										{(field) => (
											<Select
												variant="bordered"
												label="Output Format"
												selectedKeys={[field.state.value]}
												onSelectionChange={(keys) => {
													const value = Array.from(keys)[0] as "text" | "json";
													field.handleChange(value);
												}}
											>
												<SelectItem key="text">Text</SelectItem>
												<SelectItem key="json">JSON</SelectItem>
											</Select>
										)}
									</form.Field>
									<form.Field name="temperature">
										{(field) => (
											<Slider
												size="sm"
												label="Temperature"
												value={field.state.value}
												onChange={(value) =>
													field.handleChange(value as number)
												}
												minValue={0}
												maxValue={1}
												step={0.01}
											/>
										)}
									</form.Field>
									<form.Field name="maxStepCount">
										{(field) => (
											<Slider
												size="sm"
												label="Max Step Count"
												value={field.state.value}
												onChange={(value) =>
													field.handleChange(value as number)
												}
												minValue={1}
												maxValue={10}
												step={1}
											/>
										)}
									</form.Field>

									{/* Provider-specific options */}
									<form.Subscribe selector={(state) => state.values.model}>
										{(model) => {
											const selectedProvider = providers?.find(
												(p) => p.id === model.provider_id,
											);
											const providerType = selectedProvider?.type;

											if (!providerType) return null;

											return (
												<form.Field name="providerOptions">
													{(field) => (
														<ProviderOptions
															providerType={providerType}
															value={field.state.value}
															onValueChange={field.handleChange}
														/>
													)}
												</form.Field>
											);
										}}
									</form.Subscribe>
								</PopoverContent>
							</Popover>

							<Button
								isIconOnly
								size="sm"
								variant="flat"
								onPress={() => onVariablesOpenChange()}
							>
								<LucideBraces className="size-4" />
							</Button>
						</div>

						<Button
							size="sm"
							color="primary"
							type="button"
							onPress={() => handleRun(form.state.values)}
							isDisabled={isRunning}
							startContent={
								isRunning ? (
									<LucideLoader2 className="animate-spin size-3.5" />
								) : (
									<LucidePlay className="size-3.5" />
								)
							}
						>
							Run
						</Button>
					</div>
					<div className="flex-1 overflow-y-auto p-4 space-y-4">
						<form.Field name="tools">
							{(field) => (
								<ToolsSection
									workspaceId={workspaceId}
									value={field.state.value}
									onValueChange={field.handleChange}
									isInvalid={field.state.meta.errors.length > 0}
								/>
							)}
						</form.Field>

						<form.Field name="messages">
							{(field) => (
								<Messages
									value={field.state.value}
									onValueChange={field.handleChange}
									onVariablePress={onVariablesOpenChange}
								/>
							)}
						</form.Field>

						<AddMessage
							onAdd={(newMessage: MessageT) => {
								const currentMessages = form.getFieldValue("messages");
								form.setFieldValue("messages", [
									...currentMessages,
									newMessage,
								]);
							}}
						/>
					</div>
				</div>

				<div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
					<Alerts warnings={warnings} errors={errors} />

					{!isRunning && generatedMessages.length === 0 && (
						<p className="text-sm text-default-500 my-auto text-center">
							Run your agent to see the generated response here.
						</p>
					)}

					<Messages
						isReadOnly
						value={generatedMessages}
						onValueChange={() => {}}
						onVariablePress={onVariablesOpenChange}
					/>

					<div>
						{!isRunning && generatedMessages.length > 0 && (
							<Button
								size="sm"
								variant="flat"
								startContent={<LucideCornerUpLeft className="size-3.5" />}
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
