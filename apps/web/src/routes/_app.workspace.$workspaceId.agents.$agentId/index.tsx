import {
	Button,
	Dropdown,
	Input,
	Label,
	ListBox,
	Modal,
	NumberField,
	Popover,
	Select,
	Slider,
	Spinner,
	TextField,
	useOverlayState,
} from "@heroui/react";
import type { Tables } from "@repo/database";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";

import {
	LucideBraces,
	LucideCode,
	LucideCornerUpLeft,
	LucideEllipsisVertical,
	LucidePencil,
	LucidePlay,
	LucideSettings2,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import useDb from "use-db";

import { Messages, type MessageT } from "@/components/messages";
import { PageHeader } from "@/components/page-header";
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

	const [version, setVersion] = useState<Tables<"agent_versions">>();
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

	const variablesState = useOverlayState();
	const editNameState = useOverlayState();
	const [editingName, setEditingName] = useState("");

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

	// Subscribe to form values needed by VariablesDrawer directly,
	// so they aren't trapped in a form.Subscribe memoized closure
	const drawerMessages = useStore(form.store, (state) => state.values.messages);
	const drawerTools = useStore(form.store, (state) => state.values.tools);

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
			<PageHeader
				breadcrumbs={[
					{
						label: "Agents",
						to: "/workspace/$workspaceId/agents",
						params: { workspaceId },
						search: { page: 1 },
					},
					{ label: name },
				]}
			>
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
						variant="tertiary"
						onPress={() => copyToClipboard(agent.id, "Copied agent ID!")}
					>
						<LucideCode className="size-3.5" />
					</Button>
				)}

				{versions?.length && (
					<form.Subscribe selector={(state) => ({ isDirty: state.isDirty })}>
						{(state) => (
							<VersionHistory
								workspaceId={workspaceId}
								versions={versions || []}
								stagingVersionId={agent?.staging_version_id}
								productionVersionId={agent?.production_version_id}
								currentVersionId={version?.id}
								isDirty={state.isDirty}
								onSelectionChange={(v: Tables<"agent_versions">) => {
									setVersion(v);
								}}
							/>
						)}
					</form.Subscribe>
				)}

				<VariablesDrawer
					isOpen={variablesState.isOpen}
					onOpenChange={() => variablesState.setOpen(!variablesState.isOpen)}
					messages={drawerMessages}
					values={variableValues}
					onValuesChange={setVariableValues}
					onRun={() => handleRun(form.state.values)}
					mcps={mcps}
					tools={drawerTools}
					mcpHeaderValues={mcpHeaderValues}
					onMcpHeaderValuesChange={setMcpHeaderValues}
				/>

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

				{!isNewAgent && (
					<Dropdown>
						<Button size="sm" variant="tertiary" isIconOnly>
							<LucideEllipsisVertical className="size-4" />
						</Button>
						<Dropdown.Popover placement="bottom end">
							<Dropdown.Menu>
								<Dropdown.Item
									id="edit-name"
									textValue="Edit name"
									onAction={() => {
										setEditingName(name);
										editNameState.open();
									}}
								>
									<LucidePencil className="size-4" />
									<Label>Edit name</Label>
								</Dropdown.Item>
							</Dropdown.Menu>
						</Dropdown.Popover>
					</Dropdown>
				)}
			</PageHeader>

			<Modal state={editNameState}>
				<Modal.Backdrop>
					<Modal.Container>
						<Modal.Dialog>
							<Modal.Header>
								<Modal.Heading>Edit Agent Name</Modal.Heading>
							</Modal.Header>
							<Modal.Body>
								<TextField
									name="agent-name"
									value={editingName}
									onChange={setEditingName}
									autoFocus
								>
									<Label>Name</Label>
									<Input placeholder="Agent name" />
								</TextField>
							</Modal.Body>
							<Modal.Footer>
								<Button variant="tertiary" onPress={editNameState.close}>
									Cancel
								</Button>
								<Button
									variant="primary"
									isDisabled={!editingName.trim()}
									onPress={() => {
										const trimmed = editingName.trim();
										if (!trimmed) return;
										setName(trimmed);
										updateNameMutation.mutate(trimmed);
										editNameState.close();
									}}
								>
									Save
								</Button>
							</Modal.Footer>
						</Modal.Dialog>
					</Modal.Container>
				</Modal.Backdrop>
			</Modal>
			<div className="flex flex-1 overflow-hidden">
				<div className="basis-1/2 grow-0 shrink-0 min-w-0 flex flex-col border-r border-border min-h-0">
					<div className="flex gap-2 justify-between items-center p-4 border-b border-border">
						<div className="flex gap-2 min-w-0">
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

							<Popover>
								<Button size="sm" variant="tertiary">
									<LucideSettings2 className="size-4" />
									Parameters
								</Button>
								<Popover.Content placement="bottom">
									<Popover.Dialog className="p-4 flex flex-col items-start gap-4 w-96">
										<form.Field name="maxOutputTokens">
											{(field) => (
												<>
													<NumberField
														minValue={0}
														name="Max Output Tokens"
														value={field.state.value}
														onChange={field.handleChange}
														variant="secondary"
														fullWidth
													>
														<Label>Max Output Tokens</Label>
														<NumberField.Group>
															<NumberField.DecrementButton />
															<NumberField.Input />
															<NumberField.IncrementButton />
														</NumberField.Group>
													</NumberField>
												</>
											)}
										</form.Field>
										<form.Field name="outputFormat">
											{(field) => (
												<Select
													className="w-full"
													value={field.state.value}
													onChange={(value) => {
														field.handleChange(value as "text" | "json");
													}}
													variant="secondary"
												>
													<Label>Output Format</Label>
													<Select.Trigger>
														<Select.Value />
														<Select.Indicator />
													</Select.Trigger>
													<Select.Popover>
														<ListBox>
															<ListBox.Item id="text" textValue="Text">
																Text
															</ListBox.Item>
															<ListBox.Item id="json" textValue="JSON">
																JSON
															</ListBox.Item>
														</ListBox>
													</Select.Popover>
												</Select>
											)}
										</form.Field>
										<form.Field name="temperature">
											{(field) => (
												<Slider
													className="w-full"
													value={field.state.value}
													onChange={(value) =>
														field.handleChange(value as number)
													}
													minValue={0}
													maxValue={1}
													step={0.01}
												>
													<Label>Temperature</Label>
													<Slider.Output />
													<Slider.Track>
														<Slider.Fill />
														<Slider.Thumb />
													</Slider.Track>
												</Slider>
											)}
										</form.Field>
										<form.Field name="maxStepCount">
											{(field) => (
												<Slider
													className="w-full"
													value={field.state.value}
													onChange={(value) =>
														field.handleChange(value as number)
													}
													minValue={1}
													maxValue={50}
													step={1}
												>
													<Label>Max Step Count</Label>
													<Slider.Output />
													<Slider.Track>
														<Slider.Fill />
														<Slider.Thumb />
													</Slider.Track>
												</Slider>
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
									</Popover.Dialog>
								</Popover.Content>
							</Popover>

							<Button
								size="sm"
								variant="tertiary"
								onPress={() => variablesState.setOpen(!variablesState.isOpen)}
							>
								<LucideBraces className="size-4" />
							</Button>
						</div>

						<Button
							size="sm"
							variant="primary"
							type="button"
							className="shrink-0"
							onPress={() => handleRun(form.state.values)}
							isDisabled={isRunning}
							isPending={isRunning}
						>
							{({ isPending }) => (
								<>
									{isPending ? (
										<Spinner color="current" size="sm" />
									) : (
										<LucidePlay className="size-3.5" />
									)}
									Run
								</>
							)}
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
									onVariablePress={() =>
										variablesState.setOpen(!variablesState.isOpen)
									}
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

				<div className="basis-1/2 grow-0 shrink-0 min-w-0 flex flex-col p-4 gap-4 overflow-y-auto">
					<Alerts warnings={warnings} errors={errors} />

					{!isRunning && generatedMessages.length === 0 && (
						<p className="text-sm text-muted my-auto text-center">
							Run your agent to see the generated response here.
						</p>
					)}

					<Messages
						isReadOnly
						value={generatedMessages}
						onValueChange={() => {}}
						onVariablePress={() =>
							variablesState.setOpen(!variablesState.isOpen)
						}
					/>

					<div>
						{!isRunning && generatedMessages.length > 0 && (
							<Button
								size="sm"
								variant="tertiary"
								onPress={handleAddToConversation}
							>
								<LucideCornerUpLeft className="size-3.5" />
								Add to conversation
							</Button>
						)}
					</div>
				</div>
			</div>
		</form>
	);
}
