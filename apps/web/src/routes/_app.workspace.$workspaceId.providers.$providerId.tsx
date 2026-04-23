import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
	ListBox,
	Select,
	Spinner,
	TextField,
	toast,
} from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import * as openpgp from "openpgp";
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

function RouteComponent() {
	const { workspaceId, providerId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewProvider = providerId === "new";

	// Fetch existing provider if editing
	const { data: providers } = useQuery({
		...providersQuery(workspaceId),
		enabled: !isNewProvider,
	});

	const currentProvider = providers?.find((p) => p.id === providerId);

	// Create mutation
	const createMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			type: string;
			data: string;
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

			const { error } = await supabase.from("providers").insert({
				id: nanoid(),
				name: values.name,
				type: values.type,
				encrypted_data,
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

	// Update mutation
	const updateMutation = useMutation({
		mutationFn: async (values: {
			name: string;
			type: string;
			data: string;
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

			const { error } = await supabase
				.from("providers")
				.update({
					name: values.name,
					type: values.type,
					data: JSON.parse(values.data),
					encrypted_data,
					updated_at: new Date().toISOString(),
				})
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

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			name: currentProvider?.name || "",
			type: currentProvider?.type || "",
			data: JSON.stringify(
				{
					apiKey: "your-api-key",
				},
				null,
				2,
			),
		},
		onSubmit: async ({ value }) => {
			if (isNewProvider) {
				await createMutation.mutateAsync(value);
			} else {
				await updateMutation.mutateAsync(value);
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

						{/* Data Field */}
						<form.Field
							name="data"
							validators={{
								onChange: ({ value }) => validateJsonField(value),
							}}
						>
							{(field) => (
								<MonacoJsonField
									label="Configuration (JSON)"
									isRequired
									description="Provider-specific configuration in JSON format. This will override any existing configuration."
									isInvalid={field.state.meta.errors.length > 0}
									errorMessage={field.state.meta.errors[0]}
									value={field.state.value}
									onValueChange={field.handleChange}
									editorMinHeight={200}
								/>
							)}
						</form.Field>

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
