import { Button, Input, Select, SelectItem } from "@heroui/react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { z } from "zod";
import { Messages, type MessageT, messageSchema } from "@/components/messages";
import { agentVersionsQuery, providersQuery } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute(
	"/_app/workspace/$workspaceId/agents/$agentId",
)({
	component: RouteComponent,
});

// Zod schema for form validation
const agentFormSchema = z.object({
	providerId: z.string().min(1, "Provider is required"),
	model: z.string().min(1, "Model is required"),
	messages: z.array(messageSchema).min(1, "At least one message is required"),
});

// Helper to get error message as string
function getErrorMessage(errors: unknown[]): string | undefined {
	if (errors.length === 0) return undefined;
	const error = errors[0];
	if (typeof error === "string") return error;
	if (error && typeof error === "object" && "message" in error) {
		return String(error.message);
	}
	return undefined;
}

function RouteComponent() {
	const { workspaceId, agentId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNewAgent = agentId === "new";

	// Fetch available providers
	const { data: providers, isLoading: isLoadingProviders } = useQuery(
		providersQuery(workspaceId),
	);

	// Fetch existing agent versions if editing
	const { data: versions, isLoading: isLoadingVersions } = useQuery({
		...agentVersionsQuery(agentId),
		enabled: !isNewAgent,
	});

	const latestVersion = versions?.[0]; // Versions are ordered by created_at desc

	// Create mutation (creates both agent and first version)
	const createMutation = useMutation({
		mutationFn: async (values: { providerId: string; model: string }) => {
			const newAgentId = nanoid();
			const newVersionId = nanoid();

			// Create agent
			const { error: agentError } = await supabase.from("agents").insert({
				id: newAgentId,
				name: "",
				workspace_id: workspaceId,
			});

			if (agentError) throw agentError;

			// Create first version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: newAgentId,
				provider_id: values.providerId,
				data: { model: values.model },
				is_deployed: false,
			});

			if (versionError) throw versionError;

			return newAgentId;
		},
		onSuccess: (newAgentId) => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			toast.success("Agent created successfully");
			navigate({
				to: "/workspace/$workspaceId/agents/$agentId",
				params: { workspaceId, agentId: newAgentId },
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create agent",
			);
		},
	});

	// Update mutation (creates new version)
	const updateMutation = useMutation({
		mutationFn: async (values: { providerId: string; model: string }) => {
			const newVersionId = nanoid();

			// Create new version
			const { error: versionError } = await supabase.from("versions").insert({
				id: newVersionId,
				agent_id: agentId,
				provider_id: values.providerId,
				data: { model: values.model },
				is_deployed: false,
			});

			if (versionError) throw versionError;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", workspaceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] });
			queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
			toast.success("New version created successfully");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create new version",
			);
		},
	});

	// Initialize TanStack Form
	const form = useForm({
		defaultValues: {
			providerId: latestVersion?.provider_id || "",
			model: (latestVersion?.data as { model?: string } | null)?.model || "",
			messages: (latestVersion?.data as { messages?: MessageT[] } | null)
				?.messages || [
				{
					role: "system",
					content: "",
				},
			],
		},
		validators: {
			onChange: agentFormSchema,
		},
		onSubmit: async ({ value }) => {
			if (isNewAgent) {
				await createMutation.mutateAsync(value);
			} else {
				await updateMutation.mutateAsync(value);
			}
		},
	});

	const isLoading =
		createMutation.isPending ||
		updateMutation.isPending ||
		isLoadingProviders ||
		isLoadingVersions;

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
						{isNewAgent ? "Create New Agent" : "Edit Agent"}
					</h1>
					<p className="text-default-500">
						{isNewAgent
							? "Configure a new AI agent for your workspace"
							: "Update your agent configuration (creates a new version)"}
					</p>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6"
				>
					{/* Provider Field */}
					<form.Field name="providerId">
						{(field) => (
							<Select
								label="Provider"
								placeholder="Select a provider"
								selectedKeys={field.state.value ? [field.state.value] : []}
								onSelectionChange={(keys) => {
									const selected = Array.from(keys)[0];
									field.handleChange(selected as string);
								}}
								isRequired
								variant="bordered"
								description="The AI provider to use for this agent"
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={getErrorMessage(field.state.meta.errors)}
								isLoading={isLoadingProviders}
								isDisabled={!providers || providers.length === 0}
							>
								{providers?.map((provider) => (
									<SelectItem key={provider.id}>{provider.name}</SelectItem>
								)) || []}
							</Select>
						)}
					</form.Field>

					{/* Model Field */}
					<form.Field name="model">
						{(field) => (
							<Input
								label="Model"
								placeholder="e.g., gpt-4"
								value={field.state.value}
								onValueChange={field.handleChange}
								isRequired
								variant="bordered"
								description="The AI model to use (e.g., gpt-4, claude-3-opus)"
								isInvalid={field.state.meta.errors.length > 0}
								errorMessage={getErrorMessage(field.state.meta.errors)}
							/>
						)}
					</form.Field>

					<form.Field name="messages" mode="array">
						{(field) => (
							<Messages
								value={field.state.value}
								onValueChange={field.handleChange}
							/>
						)}
					</form.Field>

					<div className="flex justify-end gap-3">
						<Button
							variant="light"
							onPress={() =>
								navigate({
									to: "/workspace/$workspaceId/agents",
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
									{isNewAgent ? "Create Agent" : "Save New Version"}
								</Button>
							)}
						</form.Subscribe>
					</div>
				</form>
			</div>
		</div>
	);
}
