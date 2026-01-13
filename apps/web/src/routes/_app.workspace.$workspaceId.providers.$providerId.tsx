import { addToast, Button, Input, Select, SelectItem } from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { nanoid } from "nanoid";
import * as openpgp from "openpgp";
import { MonacoJsonField } from "@/components/monaco-json-field";
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
			addToast({
				description: "Provider created successfully.",
				color: "success",
			});
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to create provider.",
				color: "danger",
			});
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
			addToast({
				description: "Provider updated successfully.",
				color: "success",
			});
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			addToast({
				description:
					error instanceof Error ? error.message : "Failed to update provider.",
				color: "danger",
			});
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
		<div>
			<div className="flex items-center p-2">
				<Button
					variant="light"
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
					{isNewProvider ? "Add New Provider" : "Edit Provider"}
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
									? "Provider name is required"
									: undefined,
						}}
					>
						{(field) => (
							<Input
								label="Name"
								placeholder="e.g., My OpenAI Provider"
								value={field.state.value}
								onValueChange={field.handleChange}
								isRequired
								variant="bordered"
								description="A friendly name to identify this provider"
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={field.state.meta.errors[0]}
							/>
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
								label="Type"
								placeholder="Select a provider type"
								selectedKeys={field.state.value ? [field.state.value] : []}
								onSelectionChange={(keys) => {
									const selected = Array.from(keys)[0];
									field.handleChange(selected as string);
								}}
								isRequired
								variant="bordered"
								description="The AI provider service you want to use"
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={field.state.meta.errors[0]}
							>
								{PROVIDER_TYPES.map((provider) => (
									<SelectItem
										key={provider.key}
										variant="flat"
										startContent={<provider.icon className="size-5" />}
									>
										{provider.label}
									</SelectItem>
								))}
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
							variant="light"
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
									color="primary"
									isLoading={isLoading || state.isSubmitting}
									isDisabled={!state.canSubmit || isLoading}
								>
									{isNewProvider ? "Create" : "Update"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</div>
		</div>
	);
}
