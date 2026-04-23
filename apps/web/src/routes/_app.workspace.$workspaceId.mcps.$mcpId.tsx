import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
	Spinner,
	TextField,
	toast,
} from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, ShieldAlert } from "lucide-react";
import { nanoid } from "nanoid";
import * as openpgp from "openpgp";
import { useState } from "react";
import { MonacoJsonField } from "@/components/monaco-json-field";
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

function RouteComponent() {
	const { workspaceId, mcpId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewMcp = mcpId === "new";

	// Whether the user has explicitly opted to edit the config
	const [showConfigEditor, setShowConfigEditor] = useState(false);

	// Fetch existing MCP if editing
	const { data: mcps } = useQuery({
		...mcpsQuery(workspaceId),
		enabled: !isNewMcp,
	});

	const currentMcp = mcps?.find((m) => m.id === mcpId);

	// Create mutation
	const createMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			data: string;
			custom_headers: string;
		}) => {
			const publicKey = await openpgp.readKey({
				armoredKey: import.meta.env.VITE_PUBLIC_PGP_PUBLIC_KEY,
			});

			const encrypted_data = await openpgp.encrypt({
				encryptionKeys: publicKey,
				message: await openpgp.createMessage({
					text: values.data,
				}),
			});

			const id = nanoid();

			const { error } = await supabase.from("mcps").insert({
				id,
				name: values.name,
				encrypted_data,
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

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) return;

			const baseURL = import.meta.env.DEV ? "http://localhost:2223" : "";

			await fetch(`${baseURL}/internal/refresh-mcp`, {
				method: "POST",
				body: JSON.stringify({ mcp_id: id }),
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to create MCP server.",
			);
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			data: string;
			custom_headers: string;
			updateConfig: boolean;
		}) => {
			const updatePayload: Record<string, unknown> = {
				name: values.name,
				custom_headers: values.custom_headers.trim() || undefined,
				updated_at: new Date().toISOString(),
			};

			// Only update encrypted_data if user explicitly chose to edit config
			if (values.updateConfig) {
				const publicKey = await openpgp.readKey({
					armoredKey: import.meta.env.VITE_PUBLIC_PGP_PUBLIC_KEY,
				});

				updatePayload.encrypted_data = await openpgp.encrypt({
					encryptionKeys: publicKey,
					message: await openpgp.createMessage({
						text: values.data,
					}),
				});
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

			queryClient.invalidateQueries({ queryKey: ["mcps", workspaceId] });
		},
		onError: (error) => {
			toast.danger(
				error instanceof Error ? error.message : "Failed to update MCP server.",
			);
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			name: currentMcp?.name || "",
			custom_headers: currentMcp?.custom_headers || "",
			data: DEFAULT_CONFIG,
		},
		onSubmit: async ({ value }) => {
			if (isNewMcp) {
				await createMutation.mutateAsync(value);
			} else {
				await updateMutation.mutateAsync({
					...value,
					updateConfig: showConfigEditor,
				});
			}
		},
	});

	const isLoading = createMutation.isPending || updateMutation.isPending;

	return (
		<div>
			<div className="flex items-center p-2">
				<Button
					variant="tertiary"
					isIconOnly
					onPress={() =>
						navigate({
							to: "..",
						})
					}
				>
					<ArrowLeft className="size-4" />
				</Button>
			</div>

			<div className="p-6 max-w-4xl mx-auto space-y-6">
				<h1 className="text-xl font-medium tracking-tight">
					{isNewMcp ? "Add New MCP Server" : "Edit MCP Server"}
				</h1>

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
									Comma-separated list of header names that callers can provide
									at runtime.
								</Description>
							</TextField>
						)}
					</form.Field>

					{/* Configuration Section */}
					{isNewMcp ? (
						// New MCP: always show the config editor
						<form.Field
							name="data"
							validators={{
								onChange: ({ value }) => validateJsonField(value),
							}}
						>
							{(field) => (
								<MonacoJsonField
									label="Configuration (JSON)"
									value={field.state.value}
									onValueChange={field.handleChange}
									isRequired
									description="MCP server configuration in JSON format. See Vercel AI SDK MCP docs for details."
									isInvalid={field.state.meta.errors.length > 0}
									errorMessage={field.state.meta.errors[0]}
								/>
							)}
						</form.Field>
					) : showConfigEditor ? (
						// Editing: user explicitly chose to edit config
						<>
							<div className="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2 text-warning-700 text-sm">
								<ShieldAlert className="size-4 shrink-0" />
								<span>
									You are updating the server configuration. This will overwrite
									the existing encrypted config.
								</span>
							</div>
							<form.Field
								name="data"
								validators={{
									onChange: ({ value }) => validateJsonField(value),
								}}
							>
								{(field) => (
									<MonacoJsonField
										label="New Configuration (JSON)"
										value={field.state.value}
										onValueChange={field.handleChange}
										isRequired
										description="Enter the new MCP server configuration. This will replace the existing config."
										isInvalid={field.state.meta.errors.length > 0}
										errorMessage={field.state.meta.errors[0]}
									/>
								)}
							</form.Field>
						</>
					) : (
						// Editing: config is collapsed by default
						<div className="rounded-lg border border-default-200 p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-medium text-default-700">
										Server Configuration
									</p>
									<p className="text-xs text-default-400 mt-1">
										The configuration is stored encrypted. Click edit to replace
										it with a new config.
									</p>
								</div>
								<Button
									size="sm"
									variant="tertiary"
									onPress={() => setShowConfigEditor(true)}
								>
									<Pencil className="size-3" />
									Edit Config
								</Button>
							</div>
						</div>
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
	);
}
