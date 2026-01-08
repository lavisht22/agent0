import {
	Accordion,
	AccordionItem,
	Button,
	Dropdown,
	DropdownItem,
	DropdownMenu,
	DropdownTrigger,
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
	LucideChevronDown,
	LucideCode,
	LucideCornerUpLeft,
	LucideListPlus,
	LucideLoader2,
	LucidePlay,
	LucideSettings2,
	LucideShieldAlert,
	LucideShieldX,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useDb from "use-db";

import { Messages, type MessageT } from "@/components/messages";
import { ModelSelector } from "@/components/model-selector";
import { ProviderOptions } from "@/components/provider-options";
import { TagsSelect } from "@/components/tags-select";
import ToolsSection from "@/components/tools-section";
import { VariablesDrawer } from "@/components/variables-drawer";
import { VersionHistory } from "@/components/version-history";
import { copyToClipboard } from "@/lib/clipboard";
import {
	agentQuery,
	agentTagsQuery,
	agentVersionsQuery,
	providersQuery,
} from "@/lib/queries";
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
	} = useAgentRunner({ variableValues, version });

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

		const data = version.data as {
			model: { provider_id: string; name: string };
			maxOutputTokens?: number;
			outputFormat?: "text" | "json";
			temperature?: number;
			maxStepCount?: number;
			messages?: MessageT[];
			tools?: AgentFormValues["tools"];
			providerOptions?: AgentFormValues["providerOptions"];
		};

		form.reset(
			{
				model: data.model || { provider_id: "", name: "" },
				maxOutputTokens: data.maxOutputTokens || 2048,
				outputFormat: data.outputFormat || "text",
				temperature: data.temperature ?? 0.7,
				maxStepCount: data.maxStepCount || 10,
				messages: data.messages || [],
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

		setTimeout(() => {
			form.reset(state.replayData, { keepDefaultValues: true });
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

					<form.Subscribe selector={(state) => state.values.messages}>
						{(messages) => (
							<VariablesDrawer
								isOpen={isVariablesOpen}
								onOpenChange={onVariablesOpenChange}
								messages={messages}
								values={variableValues}
								onValuesChange={setVariableValues}
								onRun={() => handleRun(form.state.values)}
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
							// New agent - show Create button
							if (isNewAgent) {
								return (
									<Button
										size="sm"
										color="primary"
										isLoading={state.isSubmitting}
										isDisabled={!state.canSubmit}
										onPress={() => form.handleSubmit({})}
									>
										Create
									</Button>
								);
							}

							const isLoading =
								state.isSubmitting ||
								updateMutation.isPending ||
								deployMutation.isPending;

							// Check if current version is deployed to each environment
							const isDeployedToStaging =
								agent?.staging_version_id === version?.id;
							const isDeployedToProduction =
								agent?.production_version_id === version?.id;

							return (
								<>
									{state.isDirty && (
										<Button
											size="sm"
											color="primary"
											isLoading={isLoading}
											isDisabled={!state.canSubmit}
											onPress={() => form.handleSubmit({})}
										>
											Save
										</Button>
									)}

									{!state.isDirty &&
										(!isDeployedToProduction || !isDeployedToStaging) && (
											<Dropdown placement="bottom-end">
												<DropdownTrigger>
													<Button
														size="sm"
														color="primary"
														isLoading={isLoading}
														isDisabled={
															!state.canSubmit ||
															(isDeployedToStaging && isDeployedToProduction)
														}
														endContent={
															<LucideChevronDown className="size-4" />
														}
													>
														Deploy
													</Button>
												</DropdownTrigger>
												<DropdownMenu
													variant="flat"
													aria-label="Deploy options"
													disabledKeys={[
														...(isDeployedToStaging ? ["staging"] : []),
														...(isDeployedToProduction ? ["production"] : []),
														...(isDeployedToStaging && isDeployedToProduction
															? ["both"]
															: []),
													]}
												>
													<DropdownItem
														key="staging"
														color="warning"
														description={
															isDeployedToStaging
																? "This version is already in staging"
																: "Deploy this version to staging"
														}
														onPress={async () => {
															if (version) {
																await deployMutation.mutateAsync({
																	version_id: version.id,
																	environment: "staging",
																});
															}
														}}
													>
														To Staging
													</DropdownItem>
													<DropdownItem
														key="production"
														color="success"
														description={
															isDeployedToProduction
																? "This version is already in production"
																: "Deploy this version to production"
														}
														onPress={async () => {
															if (version) {
																await deployMutation.mutateAsync({
																	version_id: version.id,
																	environment: "production",
																});
															}
														}}
													>
														To Production
													</DropdownItem>
													<DropdownItem
														key="both"
														color="primary"
														description={
															isDeployedToStaging && isDeployedToProduction
																? "This version is already deployed to both"
																: "Deploy this version to staging and production"
														}
														onPress={async () => {
															if (version) {
																await deployMutation.mutateAsync({
																	version_id: version.id,
																	environment: "staging",
																});
																await deployMutation.mutateAsync({
																	version_id: version.id,
																	environment: "production",
																});
															}
														}}
													>
														To Both
													</DropdownItem>
												</DropdownMenu>
											</Dropdown>
										)}
								</>
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
						<Dropdown placement="top-start">
							<DropdownTrigger>
								<Button
									size="sm"
									variant="flat"
									startContent={<LucideListPlus className="size-3.5" />}
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
								<DropdownItem
									key="tool"
									title="Tool Message"
									onPress={() => {
										const currentMessages = form.getFieldValue("messages");
										form.setFieldValue("messages", [
											...currentMessages,
											{
												role: "tool",
												content: [
													{
														type: "tool-result",
														toolCallId: "",
														toolName: "",
														output: {
															type: "json",
															value: {},
														},
													},
												],
											},
										]);
									}}
								/>
							</DropdownMenu>
						</Dropdown>
					</div>
				</div>

				<div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
					{warnings.length > 0 && (
						<Accordion variant="splitted">
							{warnings.map((warning, index) => (
								<AccordionItem
									key={"${index + 1}"}
									classNames={{
										base: "bg-warning-50 bg",
										title: "text-warning-600 font-medium",
									}}
									title="Warning"
									startContent={
										<LucideShieldAlert className="size-4 text-warning-600" />
									}
								>
									<p className="whitespace-pre-wrap font-mono text-xs">
										{JSON.stringify(warning, null, 2)}
									</p>
								</AccordionItem>
							))}
						</Accordion>
					)}
					{errors.length > 0 && (
						<Accordion variant="splitted">
							{errors.map((error, index) => (
								<AccordionItem
									key={"${index + 1}"}
									classNames={{
										base: "bg-danger-50",
										title: "text-danger-600 font-medium",
									}}
									title="Error"
									startContent={
										<LucideShieldX className="size-4 text-danger-600" />
									}
								>
									<p className="whitespace-pre-wrap font-mono text-xs">
										{JSON.stringify(error, null, 2)}
									</p>
								</AccordionItem>
							))}
						</Accordion>
					)}

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
