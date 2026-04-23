import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
	ListBox,
	Select,
	Spinner,
	Switch,
	TextField,
	toast,
} from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil, ShieldAlert } from "lucide-react";
import { nanoid } from "nanoid";
import * as openpgp from "openpgp";
import { useState } from "react";
import { MonacoJsonField } from "@/components/monaco-json-field";
import { PageHeader } from "@/components/page-header";
import { PROVIDER_TYPES } from "@/lib/providers";
import { providersQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/providers/$providerId",
)({
	component: RouteComponent,
});

const DEFAULT_CONFIG = JSON.stringify(
	{
		apiKey: "your-api-key",
	},
	null,
	2,
);

// Validate JSON helper
function validateJsonField(value: string) {
	if (!value || value.trim() === "") {
		return "Configuration is required";
	}
	try {
		JSON.parse(value);
		return undefined;
	} catch (e) {
		return e instanceof Error ? e.message : "Invalid JSON format";
	}
}

async function encryptConfig(value: string) {
	const publicKey = await openpgp.readKey({
		armoredKey: import.meta.env.VITE_PUBLIC_PGP_PUBLIC_KEY,
	});
	return openpgp.encrypt({
		encryptionKeys: publicKey,
		message: await openpgp.createMessage({ text: value }),
	});
}

function RouteComponent() {
	const { workspaceId, providerId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewProvider = providerId === "new";

	const { data: providers } = useQuery({
		...providersQuery(workspaceId),
		enabled: !isNewProvider,
	});

	const currentProvider = providers?.find((p) => p.id === providerId);
	const hasExistingStaging = !!currentProvider?.has_staging_config;

	// Per-environment toggle. ON when the provider already has a staging override.
	const [usePerEnvConfig, setUsePerEnvConfig] = useState(hasExistingStaging);

	// Reveal flags for the collapsed Edit Config UX (existing providers only).
	// New providers always show editors; existing providers start collapsed.
	const [showProductionEditor, setShowProductionEditor] =
		useState(isNewProvider);
	const [showStagingEditor, setShowStagingEditor] = useState(
		isNewProvider || (usePerEnvConfig && !hasExistingStaging),
	);

	const handleTogglePerEnv = (checked: boolean) => {
		setUsePerEnvConfig(checked);
		// When freshly enabling per-env on an existing provider with no staging
		// config, reveal the staging editor since the user must provide a value.
		if (checked && !isNewProvider && !hasExistingStaging) {
			setShowStagingEditor(true);
		}
	};

	const createMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			type: string;
			data_production: string;
			data_staging: string;
			usePerEnvConfig: boolean;
		}) => {
			const encrypted_data_production = await encryptConfig(
				values.data_production,
			);
			const encrypted_data_staging = values.usePerEnvConfig
				? await encryptConfig(values.data_staging)
				: null;

			const { error } = await supabase.from("providers").insert({
				id: nanoid(),
				name: values.name,
				type: values.type,
				encrypted_data_production,
				encrypted_data_staging,
				workspace_id: workspaceId,
			});

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["providers", workspaceId] });
			toast.success("Provider created successfully.");
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create provider.",
			);
		},
	});

	const updateMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			type: string;
			data_production: string;
			data_staging: string;
			usePerEnvConfig: boolean;
			updateProduction: boolean;
			updateStaging: boolean;
		}) => {
			const updatePayload: Record<string, unknown> = {
				name: values.name,
				type: values.type,
				updated_at: new Date().toISOString(),
			};

			if (values.updateProduction) {
				updatePayload.encrypted_data_production = await encryptConfig(
					values.data_production,
				);
			}

			if (values.usePerEnvConfig) {
				if (values.updateStaging) {
					updatePayload.encrypted_data_staging = await encryptConfig(
						values.data_staging,
					);
				}
			} else {
				// Per-env toggle is OFF: clear any existing staging override.
				updatePayload.encrypted_data_staging = null;
			}

			const { error } = await supabase
				.from("providers")
				.update(updatePayload)
				.eq("id", providerId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["providers", workspaceId] });
			toast.success("Provider updated successfully.");
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to update provider.",
			);
		},
	});

	const form = useForm({
		defaultValues: {
			name: currentProvider?.name || "",
			type: currentProvider?.type || "",
			data_production: DEFAULT_CONFIG,
			data_staging: DEFAULT_CONFIG,
		},
		onSubmit: async ({ value }) => {
			if (isNewProvider) {
				await createMutation.mutateAsync({
					...value,
					usePerEnvConfig,
				});
			} else {
				await updateMutation.mutateAsync({
					...value,
					usePerEnvConfig,
					updateProduction: showProductionEditor,
					updateStaging: showStagingEditor,
				});
			}
		},
	});

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<div className="h-screen flex flex-col">
			<PageHeader
				breadcrumbs={[
					{
						label: "Providers",
						to: "/workspace/$workspaceId/providers",
						params: { workspaceId },
					},
					{
						label: isNewProvider ? "New" : currentProvider?.name || "Edit",
					},
				]}
			/>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto space-y-6">
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						{/* Name Field */}
						<form.Field
							name="name"
							validators={{
								onChange: ({ value }) =>
									!value || value.trim() === ""
										? "Provider name is required"
										: undefined,
							}}
						>
							{(field) => (
								<TextField
									name="name"
									isRequired
									isInvalid={field.state.meta.errors.length > 0}
								>
									<Label>Name</Label>
									<Input
										placeholder="e.g., My OpenAI Provider"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<Description>
										A friendly name to identify this provider
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
								</TextField>
							)}
						</form.Field>

						{/* Type Field */}
						<form.Field
							name="type"
							validators={{
								onChange: ({ value }) =>
									!value || value.trim() === ""
										? "Provider type is required"
										: undefined,
							}}
						>
							{(field) => (
								<Select
									value={field.state.value || null}
									onChange={(value) =>
										field.handleChange((value as string) || "")
									}
									placeholder="Select a provider type"
									isRequired
									isInvalid={field.state.meta.errors.length > 0}
								>
									<Label>Type</Label>
									<Select.Trigger>
										<Select.Value />
										<Select.Indicator />
									</Select.Trigger>
									<Description>
										The AI provider service you want to use
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
									<Select.Popover>
										<ListBox>
											{PROVIDER_TYPES.map((provider) => (
												<ListBox.Item
													key={provider.key}
													id={provider.key}
													textValue={provider.label}
												>
													<provider.icon className="size-5" />
													<Label>{provider.label}</Label>
												</ListBox.Item>
											))}
										</ListBox>
									</Select.Popover>
								</Select>
							)}
						</form.Field>

						{/* Per-environment toggle */}
						<div className="flex items-start justify-between rounded-lg border border-border p-4">
							<div className="pr-4">
								<p className="text-sm font-medium text-foreground">
									Use different config for staging
								</p>
								<p className="text-xs text-muted mt-1">
									When enabled, you can provide a separate configuration that
									the runner will use for staging requests. Otherwise the
									production config is used for both environments.
								</p>
							</div>
							<Switch
								isSelected={usePerEnvConfig}
								onChange={handleTogglePerEnv}
							>
								<Switch.Control>
									<Switch.Thumb />
								</Switch.Control>
							</Switch>
						</div>

						{/* Production Config */}
						<ConfigSection
							title={
								usePerEnvConfig ? "Production Configuration" : "Configuration"
							}
							isNew={isNewProvider}
							isExpanded={showProductionEditor}
							onEdit={() => setShowProductionEditor(true)}
							helpText={
								usePerEnvConfig
									? "Used by the runner for production requests."
									: "Used by the runner for both production and staging requests."
							}
						>
							<form.Field
								name="data_production"
								validators={{
									onChange: ({ value }) =>
										showProductionEditor ? validateJsonField(value) : undefined,
								}}
							>
								{(field) => (
									<MonacoJsonField
										label={
											isNewProvider
												? "Configuration (JSON)"
												: "New Configuration (JSON)"
										}
										isRequired
										description="Provider-specific configuration in JSON format."
										isInvalid={field.state.meta.errors.length > 0}
										errorMessage={field.state.meta.errors[0]}
										value={field.state.value}
										onValueChange={field.handleChange}
										editorMinHeight={200}
									/>
								)}
							</form.Field>
						</ConfigSection>

						{/* Staging Config */}
						{usePerEnvConfig && (
							<ConfigSection
								title="Staging Configuration"
								isNew={isNewProvider || !hasExistingStaging}
								isExpanded={showStagingEditor}
								onEdit={() => setShowStagingEditor(true)}
								helpText="Used by the runner for staging requests."
							>
								<form.Field
									name="data_staging"
									validators={{
										onChange: ({ value }) =>
											showStagingEditor ? validateJsonField(value) : undefined,
									}}
								>
									{(field) => (
										<MonacoJsonField
											label={
												isNewProvider || !hasExistingStaging
													? "Staging Configuration (JSON)"
													: "New Staging Configuration (JSON)"
											}
											isRequired
											description="Provider-specific configuration in JSON format."
											isInvalid={field.state.meta.errors.length > 0}
											errorMessage={field.state.meta.errors[0]}
											value={field.state.value}
											onValueChange={field.handleChange}
											editorMinHeight={200}
										/>
									)}
								</form.Field>
							</ConfigSection>
						)}

						<div className="flex justify-end gap-3">
							<Button
								variant="tertiary"
								onPress={() =>
									navigate({
										to: "/workspace/$workspaceId/providers",
										params: { workspaceId },
									})
								}
								isDisabled={isLoading}
							>
								Cancel
							</Button>
							<form.Subscribe
								selector={(state) => ({
									canSubmit: state.canSubmit,
									isSubmitting: state.isSubmitting,
								})}
							>
								{(state) => (
									<Button
										type="submit"
										variant="primary"
										isPending={isLoading || state.isSubmitting}
										isDisabled={!state.canSubmit || isLoading}
									>
										{({ isPending }) => (
											<>
												{isPending && <Spinner color="current" size="sm" />}
												{isNewProvider ? "Create" : "Update"}
											</>
										)}
									</Button>
								)}
							</form.Subscribe>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}

interface ConfigSectionProps {
	title: string;
	isNew: boolean;
	isExpanded: boolean;
	onEdit: () => void;
	helpText: string;
	children: React.ReactNode;
}

function ConfigSection({
	title,
	isNew,
	isExpanded,
	onEdit,
	helpText,
	children,
}: ConfigSectionProps) {
	if (isNew) {
		return (
			<div className="space-y-2">
				<p className="text-sm font-medium text-foreground">{title}</p>
				{children}
			</div>
		);
	}

	if (isExpanded) {
		return (
			<div className="space-y-3">
				<p className="text-sm font-medium text-foreground">{title}</p>
				<div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-warning text-sm">
					<ShieldAlert className="size-4 shrink-0" />
					<span>
						You are updating this configuration. This will overwrite the
						existing encrypted config.
					</span>
				</div>
				{children}
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border p-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-medium text-foreground">{title}</p>
					<p className="text-xs text-muted mt-1">
						{helpText} The configuration is stored encrypted. Click edit to
						replace it with a new config.
					</p>
				</div>
				<Button size="sm" variant="tertiary" onPress={onEdit}>
					<Pencil className="size-3" />
					Edit Config
				</Button>
			</div>
		</div>
	);
}
