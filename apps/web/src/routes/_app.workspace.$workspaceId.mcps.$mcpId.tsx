import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
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
import { mcpsQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/mcps/$mcpId",
)({
	component: RouteComponent,
});

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

const DEFAULT_CONFIG = JSON.stringify(
	{
		transport: {
			type: "http",
			url: "https://your-server.com/mcp",
			headers: { Authorization: "Bearer my-api-key" },
		},
	},
	null,
	2,
);

async function encryptConfig(value: string) {
	const publicKey = await openpgp.readKey({
		armoredKey: import.meta.env.VITE_PUBLIC_PGP_PUBLIC_KEY,
	});
	return openpgp.encrypt({
		encryptionKeys: publicKey,
		message: await openpgp.createMessage({ text: value }),
	});
}

async function refreshMcpTools(mcpId: string) {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) return;

	const baseURL = import.meta.env.DEV ? "http://localhost:2223" : "";

	await fetch(`${baseURL}/internal/refresh-mcp`, {
		method: "POST",
		body: JSON.stringify({ mcp_id: mcpId }),
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${session.access_token}`,
		},
	});
}

function RouteComponent() {
	const { workspaceId, mcpId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewMcp = mcpId === "new";

	const { data: mcps } = useQuery({
		...mcpsQuery(workspaceId),
		enabled: !isNewMcp,
	});

	const currentMcp = mcps?.find((m) => m.id === mcpId);
	const hasExistingStaging = !!currentMcp?.has_staging_config;

	const [usePerEnvConfig, setUsePerEnvConfig] = useState(hasExistingStaging);
	const [showProductionEditor, setShowProductionEditor] = useState(isNewMcp);
	const [showStagingEditor, setShowStagingEditor] = useState(
		isNewMcp || (usePerEnvConfig && !hasExistingStaging),
	);

	const handleTogglePerEnv = (checked: boolean) => {
		setUsePerEnvConfig(checked);
		if (checked && !isNewMcp && !hasExistingStaging) {
			setShowStagingEditor(true);
		}
	};

	const createMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			data_production: string;
			data_staging: string;
			custom_headers: string;
			usePerEnvConfig: boolean;
		}) => {
			const encrypted_data_production = await encryptConfig(
				values.data_production,
			);
			const encrypted_data_staging = values.usePerEnvConfig
				? await encryptConfig(values.data_staging)
				: null;

			const id = nanoid();

			const { error } = await supabase.from("mcps").insert({
				id,
				name: values.name,
				encrypted_data_production,
				encrypted_data_staging,
				workspace_id: workspaceId,
				custom_headers: values.custom_headers.trim() || undefined,
			});

			if (error) throw error;

			return { id };
		},
		onSuccess: async ({ id }) => {
			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
			toast.success("MCP server created successfully.");
			navigate({
				to: "/workspace/$workspaceId/mcps",
				params: { workspaceId },
			});

			await refreshMcpTools(id);

			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create MCP server.",
			);
		},
	});

	const updateMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			data_production: string;
			data_staging: string;
			custom_headers: string;
			usePerEnvConfig: boolean;
			updateProduction: boolean;
			updateStaging: boolean;
		}) => {
			const updatePayload: Record<string, unknown> = {
				name: values.name,
				custom_headers: values.custom_headers.trim() || undefined,
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
				updatePayload.encrypted_data_staging = null;
			}

			const { error } = await supabase
				.from("mcps")
				.update(updatePayload)
				.eq("id", mcpId);

			if (error) throw error;
		},
		onSuccess: async () => {
			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
			toast.success("MCP server updated successfully.");
			navigate({
				to: "/workspace/$workspaceId/mcps",
				params: { workspaceId },
			});

			await refreshMcpTools(mcpId);

			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to update MCP server.",
			);
		},
	});

	const form = useForm({
		defaultValues: {
			name: currentMcp?.name || "",
			custom_headers: currentMcp?.custom_headers || "",
			data_production: DEFAULT_CONFIG,
			data_staging: DEFAULT_CONFIG,
		},
		onSubmit: async ({ value }) => {
			if (isNewMcp) {
				await createMutation.mutateAsync({ ...value, usePerEnvConfig });
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
						label: "MCP Servers",
						to: "/workspace/$workspaceId/mcps",
						params: { workspaceId },
					},
					{
						label: isNewMcp ? "New" : currentMcp?.name || "Edit",
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
										? "MCP server name is required"
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
										placeholder="e.g., my-mcp-server"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<Description>
										A friendly name to identify this MCP server
									</Description>
									{field.state.meta.errors.length > 0 && (
										<FieldError>{field.state.meta.errors[0]}</FieldError>
									)}
								</TextField>
							)}
						</form.Field>

						{/* Custom Headers Field */}
						<form.Field name="custom_headers">
							{(field) => (
								<TextField name="custom_headers">
									<Label>Custom Headers</Label>
									<Input
										placeholder="e.g., X-User-Token, X-Tenant-Id"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<Description>
										Comma-separated list of header names that callers can
										provide at runtime.
									</Description>
								</TextField>
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
							isNew={isNewMcp}
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
											isNewMcp
												? "Configuration (JSON)"
												: "New Configuration (JSON)"
										}
										value={field.state.value}
										onValueChange={field.handleChange}
										isRequired
										description="MCP server configuration in JSON format. See Vercel AI SDK MCP docs for details."
										isInvalid={field.state.meta.errors.length > 0}
										errorMessage={field.state.meta.errors[0]}
									/>
								)}
							</form.Field>
						</ConfigSection>

						{/* Staging Config */}
						{usePerEnvConfig && (
							<ConfigSection
								title="Staging Configuration"
								isNew={isNewMcp || !hasExistingStaging}
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
												isNewMcp || !hasExistingStaging
													? "Staging Configuration (JSON)"
													: "New Staging Configuration (JSON)"
											}
											value={field.state.value}
											onValueChange={field.handleChange}
											isRequired
											description="MCP server configuration in JSON format. See Vercel AI SDK MCP docs for details."
											isInvalid={field.state.meta.errors.length > 0}
											errorMessage={field.state.meta.errors[0]}
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
										to: "/workspace/$workspaceId/mcps",
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
												{isNewMcp ? "Create" : "Update"}
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
