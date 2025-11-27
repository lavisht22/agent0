import { Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
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
			const { error } = await supabase.from("providers").insert({
				id: nanoid(),
				name: values.name,
				type: values.type,
				data: JSON.parse(values.data),
				workspace_id: workspaceId,
			});

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["providers", workspaceId] });
			toast.success("Provider created successfully");
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create provider",
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
			const { error } = await supabase
				.from("providers")
				.update({
					name: values.name,
					type: values.type,
					data: JSON.parse(values.data),
				})
				.eq("id", providerId);

			if (error) throw error;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["providers", workspaceId] });
			toast.success("Provider updated successfully");
			navigate({
				to: "/workspace/$workspaceId/providers",
				params: { workspaceId },
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update provider",
			);
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			name: currentProvider?.name || "",
			type: currentProvider?.type || "",
			data: currentProvider?.data
				? JSON.stringify(currentProvider.data, null, 2)
				: "{}",
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
				<div>
					<h1 className="text-2xl font-medium tracking-tight">
						{isNewProvider ? "Add New Provider" : "Edit Provider"}
					</h1>
					<p className="text-default-500">
						{isNewProvider
							? "Configure a new AI provider for your workspace"
							: "Update your provider configuration"}
					</p>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
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
								label="Provider Name"
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
								label="Provider Type"
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
									<SelectItem key={provider.key}>{provider.label}</SelectItem>
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
							<Textarea
								label="Provider Configuration (JSON)"
								placeholder='{"apiKey": "your-api-key"}'
								value={field.state.value}
								onValueChange={field.handleChange}
								isRequired
								variant="bordered"
								minRows={8}
								classNames={{
									input: "font-mono text-sm",
								}}
								description="Provider-specific configuration in JSON format. This will be passed to the Vercel AI SDK."
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={field.state.meta.errors[0]}
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
									{isNewProvider ? "Create Provider" : "Update Provider"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</div>
		</div>
	);
}
